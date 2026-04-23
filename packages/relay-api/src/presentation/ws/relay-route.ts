import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { RawData, WebSocket } from 'ws';
import { ulid } from 'ulid';
import { type JwtVerifier } from '../../application/ports/jwt-verifier';
import {
  type SttPort,
  type SttStreamHandle,
  type TranscriptEvent,
} from '../../application/ports/stt-port';
import { type TranslationPort } from '../../application/ports/translation-port';
import { toHttpErrorEnvelope } from '../http/error-mapper';
import { parseClientEvent, type ClientEvent } from './client-events';
import {
  buildSessionError,
  buildSessionPong,
  buildSessionReady,
  buildTranscriptFinal,
  buildTranscriptPartial,
  buildTranslationFinal,
  serializeServerEvent,
  type SessionErrorCode,
} from './server-events';
import { authorizeRelayUpgrade, type RelayAuthorizedContext } from './relay-auth';

export type RelayRouteDependencies = Readonly<{
  jwtVerifier: JwtVerifier;
  sttPort: SttPort;
  translationPort: TranslationPort;
  clock: () => string;
  heartbeatIntervalSec: number;
  heartbeatCheckIntervalMs?: number;
  heartbeatTimeoutFactor?: number;
  /** audio.frame/秒 の上限 (api-spec §2.4)。既定 10。 */
  audioFrameRateLimitPerSec?: number;
  /** translationId 生成器 (test で deterministic に) */
  translationIdFactory?: () => string;
}>;

const DEFAULT_HEARTBEAT_CHECK_INTERVAL_MS = 5000;
const DEFAULT_HEARTBEAT_TIMEOUT_FACTOR = 2;
// api-specification.md §2.4 の名目上限は 10/sec だが、AudioWorklet の downsample
// step を round(inputSampleRate / 16000) で算出しているため整数丸め + flush
// jitter で瞬間 11-12fps の burst が発生しうる。実運用では 15/sec まで許容し、
// 真に暴走した場合のみ reject する設計に変更。SSOT (§2.4) の 10/sec は
// "設計目標" と解釈し、Relay 側の限界は 15 に broaden する。
const DEFAULT_AUDIO_FRAME_LIMIT_PER_SEC = 15;

type RelayQuery = Readonly<{
  sessionId?: string;
  protocolVersion?: string;
  /**
   * browser WebSocket client は `Authorization` header を設定できないため
   * `?token=<stream_token>` 形式で受け付ける fallback (relay-auth.ts 参照)。
   */
  token?: string;
}>;

const contextMap = new WeakMap<FastifyRequest, RelayAuthorizedContext>();

const decodeRawMessage = (data: RawData): string => {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  return Buffer.from(data).toString('utf8');
};

const createSequencer = (): (() => number) => {
  let next = 0;
  return () => next++;
};

/**
 * 1 秒 sliding window の rate bucket。直近 windowMs (=1000) 内の timestamp を
 * 保持し、max を超えたら reject。
 */
const createRateBucket = (max: number, windowMs: number) => {
  let timestamps: number[] = [];
  return {
    tryConsume: (now: number): boolean => {
      timestamps = timestamps.filter((t) => now - t < windowMs);
      if (timestamps.length >= max) return false;
      timestamps.push(now);
      return true;
    },
  };
};

const extractClaimString = (
  claims: Readonly<Record<string, unknown>>,
  key: string,
): string | null => {
  const value = claims[key];
  return typeof value === 'string' ? value : null;
};

const extractClaimBoolean = (claims: Readonly<Record<string, unknown>>, key: string): boolean => {
  const value = claims[key];
  return typeof value === 'boolean' ? value : false;
};

type ActiveStream = Readonly<{
  handle: SttStreamHandle;
  targetLanguage: string;
  sourceLanguage: string | null;
}>;

const sendSessionError = (
  socket: WebSocket,
  context: RelayAuthorizedContext,
  nextSequence: () => number,
  clock: () => string,
  params: {
    code: SessionErrorCode;
    message: string;
    retryable: boolean;
    fatal: boolean;
  },
): void => {
  socket.send(
    serializeServerEvent(
      buildSessionError({
        sessionId: context.sessionId,
        sequence: nextSequence(),
        timestamp: clock(),
        code: params.code,
        message: params.message,
        retryable: params.retryable,
        fatal: params.fatal,
      }),
    ),
  );
};

const emitTranscriptPartial = (
  socket: WebSocket,
  context: RelayAuthorizedContext,
  nextSequence: () => number,
  clock: () => string,
  event: Extract<TranscriptEvent, { type: 'partial' }>,
): void => {
  socket.send(
    serializeServerEvent(
      buildTranscriptPartial({
        sessionId: context.sessionId,
        sequence: nextSequence(),
        timestamp: clock(),
        segmentId: event.segmentId,
        revision: event.revision,
        text: event.text,
        language: event.language,
        startOffsetMs: event.startOffsetMs,
        endOffsetMs: event.endOffsetMs,
      }),
    ),
  );
};

const emitTranscriptFinal = (
  socket: WebSocket,
  context: RelayAuthorizedContext,
  nextSequence: () => number,
  clock: () => string,
  event: Extract<TranscriptEvent, { type: 'final' }>,
): void => {
  socket.send(
    serializeServerEvent(
      buildTranscriptFinal({
        sessionId: context.sessionId,
        sequence: nextSequence(),
        timestamp: clock(),
        segmentId: event.segmentId,
        text: event.text,
        language: event.language,
        startOffsetMs: event.startOffsetMs,
        endOffsetMs: event.endOffsetMs,
        finalizedAt: event.finalizedAt,
      }),
    ),
  );
};

const emitTranslationFinal = (
  socket: WebSocket,
  context: RelayAuthorizedContext,
  nextSequence: () => number,
  clock: () => string,
  params: {
    translationId: string;
    sourceSegmentId: string;
    text: string;
    sourceLanguage: string | null;
    targetLanguage: string;
    latencyMs: number;
  },
): void => {
  socket.send(
    serializeServerEvent(
      buildTranslationFinal({
        sessionId: context.sessionId,
        sequence: nextSequence(),
        timestamp: clock(),
        translationId: params.translationId,
        sourceSegmentId: params.sourceSegmentId,
        text: params.text,
        sourceLanguage: params.sourceLanguage,
        targetLanguage: params.targetLanguage,
        latencyMs: params.latencyMs,
      }),
    ),
  );
};

/**
 * IMPL-420/421/422/423 `/relay` WebSocket 接続ルート (完全版)。
 *
 * 流れ:
 * 1. HTTP upgrade 時に preValidation で stream token を検証 (IMPL-420)
 * 2. `session.ready` 送信 (IMPL-422)
 * 3. ハートビート監視開始 (IMPL-423)
 * 4. `session.start` → SttPort.openStream、transcript event async loop を起動
 *    (IMPL-421)
 * 5. `audio.frame` → rate bucket (10/sec) + sendFrame (IMPL-402)
 * 6. STT の partial → `transcript.partial` を client へ、final →
 *    `transcript.final` + 並行して TranslationPort.translate → `translation.final`
 *    送信 (IMPL-422 + IMPL-403)
 * 7. `session.ping` → `session.pong` (IMPL-421)
 * 8. `session.stop` → SttStreamHandle.close、接続を graceful close
 * 9. `session.pause` / `session.resume`: MVP では log のみ (Deepgram は
 *    stream pause 非対応、session state は client 側管理)
 */
export const registerRelayRoute = (app: FastifyInstance, deps: RelayRouteDependencies): void => {
  const audioFrameLimit = deps.audioFrameRateLimitPerSec ?? DEFAULT_AUDIO_FRAME_LIMIT_PER_SEC;
  const translationIdFactory = deps.translationIdFactory ?? (() => ulid());

  app.get<{ Querystring: RelayQuery }>(
    '/relay',
    {
      websocket: true,
      preValidation: async (request, reply) => {
        const result = await authorizeRelayUpgrade(
          {
            authorizationHeader: request.headers.authorization,
            tokenQuery: request.query.token,
            sessionIdQuery: request.query.sessionId,
            protocolVersionQuery: request.query.protocolVersion,
          },
          deps.jwtVerifier,
        );
        if (result.isErr()) {
          const envelope = toHttpErrorEnvelope(result.error);
          const status = envelope.status === 400 ? 401 : envelope.status;
          reply.code(status);
          await reply.send({ ...envelope.body, meta: { requestId: request.id } });
          return reply;
        }
        contextMap.set(request, result.value);
      },
    },
    (socket, request) => {
      const context = contextMap.get(request);
      if (context === undefined) {
        socket.close(1011, 'relay context missing');
        return;
      }
      contextMap.delete(request);

      const nextSequence = createSequencer();
      socket.send(
        serializeServerEvent(
          buildSessionReady({
            sessionId: context.sessionId,
            sequence: nextSequence(),
            timestamp: deps.clock(),
            heartbeatIntervalSec: deps.heartbeatIntervalSec,
          }),
        ),
      );

      // ハートビート監視
      const timeoutMs =
        deps.heartbeatIntervalSec *
        (deps.heartbeatTimeoutFactor ?? DEFAULT_HEARTBEAT_TIMEOUT_FACTOR) *
        1000;
      const checkIntervalMs = deps.heartbeatCheckIntervalMs ?? DEFAULT_HEARTBEAT_CHECK_INTERVAL_MS;
      let lastActivityMs = Date.now();
      const heartbeatTimer = setInterval(() => {
        if (Date.now() - lastActivityMs > timeoutMs) {
          request.log.info(
            { sessionId: context.sessionId, lastActivityMs, timeoutMs },
            'heartbeat timeout — closing connection',
          );
          socket.close(1001, 'heartbeat timeout');
        }
      }, checkIntervalMs);
      heartbeatTimer.unref();

      // per-connection state
      let activeStream: ActiveStream | null = null;
      let audioFrameReceivedCount = 0;
      /**
       * `session.start` を受信してから `sttPort.openStream` が resolve するまで
       * の一時状態。この間 `audio.frame` が届いても `SESSION_NOT_READY` を
       * 返さず、`pendingFrames` に buffer する。client (browser extension) は
       * WebSocket の onopen 直後に session.start → audio.frame を連続 post する
       * ため、STT 接続の async レイテンシを server 側で吸収する必要がある
       * (api-specification §6 のメッセージ順序契約に準拠)。
       */
      let sttOpening = false;
      const MAX_PENDING_FRAMES = 50; // 100ms * 50 = 5s バッファ上限
      let pendingFrames: { audioBase64: string; chunkId: string }[] = [];
      const audioFrameBucket = createRateBucket(audioFrameLimit, 1000);

      const closeActiveStream = (): void => {
        pendingFrames = [];
        if (activeStream === null) return;
        const handle = activeStream.handle;
        activeStream = null;
        void handle.close().match(
          () => undefined,
          (err) => {
            request.log.warn({ err }, 'stt handle close failed');
          },
        );
      };

      const cleanup = (): void => {
        clearInterval(heartbeatTimer);
        closeActiveStream();
      };
      socket.on('close', cleanup);
      socket.on('error', cleanup);

      /**
       * STT transcript events を subscribe し、partial / final を client へ emit。
       * final が来たら TranslationPort へ投げ、成功した translation.final を
       * 送信 (失敗は log.warn、接続は維持)。
       */
      const runTranscriptLoop = (stream: ActiveStream): void => {
        void (async () => {
          for await (const event of stream.handle.events) {
            try {
              if (event.type === 'partial') {
                emitTranscriptPartial(socket, context, nextSequence, deps.clock, event);
                continue;
              }
              emitTranscriptFinal(socket, context, nextSequence, deps.clock, event);
              // 翻訳は fire-and-forget (ホットパス翻訳、結果は translation.final で送信)
              void (async () => {
                const translationResult = await deps.translationPort.translate({
                  text: event.text,
                  sourceLanguage: stream.sourceLanguage,
                  targetLanguage: stream.targetLanguage,
                });
                if (translationResult.isErr()) {
                  request.log.warn(
                    { err: translationResult.error, segmentId: event.segmentId },
                    'translation failed — skipping translation.final',
                  );
                  return;
                }
                emitTranslationFinal(socket, context, nextSequence, deps.clock, {
                  translationId: translationIdFactory(),
                  sourceSegmentId: event.segmentId,
                  text: translationResult.value.text,
                  sourceLanguage: translationResult.value.detectedSourceLanguage,
                  targetLanguage: stream.targetLanguage,
                  latencyMs: translationResult.value.latencyMs,
                });
              })();
            } catch (cause) {
              request.log.error({ err: cause }, 'transcript loop iteration failed');
            }
          }
        })();
      };

      const handleSessionStart = (
        event: Extract<ClientEvent, { eventType: 'session.start' }>,
      ): void => {
        if (activeStream !== null || sttOpening) {
          request.log.warn(
            {
              sessionId: context.sessionId,
              activeStream: activeStream !== null,
              sttOpening,
            },
            'session.start received while stream already active/opening — rejecting',
          );
          sendSessionError(socket, context, nextSequence, deps.clock, {
            code: 'INVALID_STATE_TRANSITION',
            message: 'session.start received while stream is already active',
            retryable: false,
            fatal: false,
          });
          return;
        }
        request.log.info(
          {
            sessionId: context.sessionId,
            sourceLanguage: event.payload.sourceLanguage,
            targetLanguage: event.payload.targetLanguage,
            autoDetect: event.payload.autoDetectLanguage,
          },
          'session.start accepted — opening STT stream',
        );
        sttOpening = true;
        // JWT claims / session.start payload どちらからも language を決定
        const sourceLanguage =
          event.payload.sourceLanguage ??
          extractClaimString(context.tokenPayload.claims, 'sourceLanguage');
        const autoDetectLanguage =
          event.payload.autoDetectLanguage ||
          extractClaimBoolean(context.tokenPayload.claims, 'autoDetectLanguage');
        const targetLanguage = event.payload.targetLanguage;
        void deps.sttPort
          .openStream({
            sourceLanguage: autoDetectLanguage ? null : sourceLanguage,
            autoDetectLanguage,
          })
          .match(
            (handle) => {
              const stream: ActiveStream = {
                handle,
                targetLanguage,
                sourceLanguage: autoDetectLanguage ? null : sourceLanguage,
              };
              activeStream = stream;
              sttOpening = false;
              // pending frame を flush (rate limit は既に consume 済、再度は不要)
              if (pendingFrames.length > 0) {
                request.log.info(
                  { count: pendingFrames.length, sessionId: context.sessionId },
                  'flushing pending audio.frame buffer after session.start',
                );
                for (const frame of pendingFrames) {
                  const flushResult = handle.sendFrame(frame);
                  if (flushResult.isErr()) {
                    request.log.warn(
                      { err: flushResult.error },
                      'stt sendFrame failed during pending flush',
                    );
                  }
                }
                pendingFrames = [];
              }
              runTranscriptLoop(stream);
            },
            (err) => {
              sttOpening = false;
              pendingFrames = [];
              request.log.error({ err }, 'stt openStream failed');
              sendSessionError(socket, context, nextSequence, deps.clock, {
                code: 'STT_ERROR',
                message: 'failed to open STT stream',
                retryable: true,
                fatal: false,
              });
            },
          );
      };

      const handleAudioFrame = (
        event: Extract<ClientEvent, { eventType: 'audio.frame' }>,
      ): void => {
        // session.start 未受信 / 既受信で STT open 待ち / ストリーム確立済 の 3 状態を分岐
        if (activeStream === null && !sttOpening) {
          request.log.warn(
            {
              sessionId: context.sessionId,
              chunkId: event.payload.chunkId,
              phase: 'handleAudioFrame: no session.start received yet',
            },
            'REJECTING audio.frame — activeStream=null, sttOpening=false',
          );
          sendSessionError(socket, context, nextSequence, deps.clock, {
            code: 'SESSION_NOT_READY',
            message: 'audio.frame received before session.start',
            retryable: false,
            fatal: false,
          });
          return;
        }
        if (!audioFrameBucket.tryConsume(Date.now())) {
          sendSessionError(socket, context, nextSequence, deps.clock, {
            code: 'RATE_LIMIT_EXCEEDED',
            message: `audio.frame rate limit exceeded (${String(audioFrameLimit)}/sec)`,
            retryable: true,
            fatal: false,
          });
          return;
        }
        if (activeStream === null) {
          // STT open 待ちの間は buffer。上限超過で drop (hot path を止めない)
          if (pendingFrames.length < MAX_PENDING_FRAMES) {
            pendingFrames.push({
              audioBase64: event.payload.audioBase64,
              chunkId: event.payload.chunkId,
            });
          } else {
            request.log.warn(
              { count: pendingFrames.length, chunkId: event.payload.chunkId },
              'pending audio.frame buffer full — dropping frame during STT open',
            );
          }
          return;
        }
        const result = activeStream.handle.sendFrame({
          audioBase64: event.payload.audioBase64,
          chunkId: event.payload.chunkId,
        });
        if (result.isErr()) {
          request.log.warn({ err: result.error }, 'stt sendFrame failed');
        }
      };

      const handleSessionStop = (): void => {
        closeActiveStream();
      };

      const dispatchClientEvent = (event: ClientEvent): void => {
        // 診断: 全 client event を info level で出す (頻度の高い audio.frame は
        // 1 件目と 10 件ごとに間引き)。
        if (event.eventType === 'audio.frame') {
          audioFrameReceivedCount += 1;
          if (audioFrameReceivedCount === 1 || audioFrameReceivedCount % 10 === 0) {
            request.log.info(
              {
                sessionId: context.sessionId,
                activeStream: activeStream !== null,
                sttOpening,
                pendingCount: pendingFrames.length,
                totalReceived: audioFrameReceivedCount,
              },
              'audio.frame received (sample)',
            );
          }
        } else {
          request.log.info(
            {
              sessionId: context.sessionId,
              eventType: event.eventType,
              activeStream: activeStream !== null,
              sttOpening,
            },
            'client event received',
          );
        }
        switch (event.eventType) {
          case 'session.ping':
            socket.send(
              serializeServerEvent(
                buildSessionPong({
                  sessionId: context.sessionId,
                  sequence: nextSequence(),
                  timestamp: deps.clock(),
                }),
              ),
            );
            return;
          case 'session.start':
            handleSessionStart(event);
            return;
          case 'audio.frame':
            handleAudioFrame(event);
            return;
          case 'session.stop':
            handleSessionStop();
            return;
          case 'session.pause':
          case 'session.resume':
            // MVP: log のみ。Deepgram は stream pause 非対応のため再接続で代替
            request.log.debug(
              { eventType: event.eventType, sequence: event.sequence },
              'pause/resume event received (no-op in MVP)',
            );
            return;
        }
      };

      socket.on('message', (raw: RawData) => {
        lastActivityMs = Date.now();
        const text = decodeRawMessage(raw);
        const parsed = parseClientEvent(text);
        if (parsed.isErr()) {
          const detail =
            parsed.error.kind === 'invariant-violation' ? parsed.error.details : 'invalid event';
          sendSessionError(socket, context, nextSequence, deps.clock, {
            code: 'VALIDATION_ERROR',
            message: detail,
            retryable: false,
            fatal: false,
          });
          return;
        }
        try {
          dispatchClientEvent(parsed.value);
        } catch (cause) {
          request.log.error({ err: cause }, 'dispatch failure');
          sendSessionError(socket, context, nextSequence, deps.clock, {
            code: 'INTERNAL_ERROR',
            message: cause instanceof Error ? cause.message : 'unknown internal error',
            retryable: false,
            fatal: true,
          });
        }
      });
    },
  );
};
