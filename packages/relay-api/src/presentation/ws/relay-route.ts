import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { RawData, WebSocket } from 'ws';
import { ulid } from 'ulid';
import { type JwtVerifier } from '../../application/ports/jwt-verifier';
import {
  type SttEndpointingConfig,
  type SttPort,
  type SttStreamHandle,
  type TranscriptEvent,
} from '../../application/ports/stt-port';
import {
  type GlossaryEntry,
  type PrecedingContext,
  type TranslationPort,
} from '../../application/ports/translation-port';
import { createComposeTranslationContextUseCase } from '../../application/use-cases/compose-translation-context-use-case';
import {
  DEFAULT_ENDPOINTING_POLICY,
  mergeEndpointingPolicy,
  type EndpointingPolicy,
} from '../../domain/session/endpointing-policy';
import {
  DEFAULT_TRANSLATION_CONTEXT_WINDOW,
  mergeTranslationContextWindow,
  type TranslationContextWindow,
} from '../../domain/session/translation-context-window';
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

const isObjectRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null;

/**
 * JWT claims から endpointing / translationContext を復元する (IMPL-405 の一部)。
 * `issue-stream-token-use-case.ts` の `toSessionClaims` と対になる。
 * 各フィールドが欠落・不正型なら VO 既定値で補完する (後方互換)。
 */
const extractEndpointingFromClaims = (
  claims: Readonly<Record<string, unknown>>,
): EndpointingPolicy => {
  const raw = claims.endpointing;
  if (!isObjectRecord(raw)) return DEFAULT_ENDPOINTING_POLICY;
  const result = mergeEndpointingPolicy(DEFAULT_ENDPOINTING_POLICY, {
    silenceThresholdMs:
      typeof raw.silenceThresholdMs === 'number' ? raw.silenceThresholdMs : undefined,
    punctuationAware: typeof raw.punctuationAware === 'boolean' ? raw.punctuationAware : undefined,
    minUtteranceMs: typeof raw.minUtteranceMs === 'number' ? raw.minUtteranceMs : undefined,
  });
  return result.isOk() ? result.value : DEFAULT_ENDPOINTING_POLICY;
};

const extractTranslationContextFromClaims = (
  claims: Readonly<Record<string, unknown>>,
): TranslationContextWindow => {
  const raw = claims.translationContext;
  if (!isObjectRecord(raw)) return DEFAULT_TRANSLATION_CONTEXT_WINDOW;
  const result = mergeTranslationContextWindow(DEFAULT_TRANSLATION_CONTEXT_WINDOW, {
    maxSegments: typeof raw.maxSegments === 'number' ? raw.maxSegments : undefined,
    includeTranslatedText:
      typeof raw.includeTranslatedText === 'boolean' ? raw.includeTranslatedText : undefined,
    holdWindowMs: typeof raw.holdWindowMs === 'number' ? raw.holdWindowMs : undefined,
  });
  return result.isOk() ? result.value : DEFAULT_TRANSLATION_CONTEXT_WINDOW;
};

/**
 * JWT claims から glossary エントリ配列を復元する (Issue #123)。
 * `issue-stream-token-use-case.ts` の `toSessionClaims.glossary.entries` と対になる。
 * 不正なデータ (型違反、欠落) は空配列で返す (後方互換 + セキュリティ: 不正
 * 入力で置換が暴走しないように)。
 */
const extractGlossaryFromClaims = (
  claims: Readonly<Record<string, unknown>>,
): readonly GlossaryEntry[] => {
  const raw = claims.glossary;
  if (!isObjectRecord(raw)) return [];
  const entries = raw.entries;
  if (!Array.isArray(entries)) return [];
  const result: GlossaryEntry[] = [];
  for (const entry of entries) {
    if (!isObjectRecord(entry)) continue;
    const source = entry.source;
    const target = entry.target;
    const caseSensitive = entry.caseSensitive;
    if (
      typeof source !== 'string' ||
      typeof target !== 'string' ||
      typeof caseSensitive !== 'boolean' ||
      source.length === 0 ||
      target.length === 0
    ) {
      continue;
    }
    result.push({ source, target, caseSensitive });
  }
  return result;
};

const toSttEndpointingConfig = (policy: EndpointingPolicy): SttEndpointingConfig => ({
  silenceThresholdMs: policy.silenceThresholdMs,
  punctuationAware: policy.punctuationAware,
  minUtteranceMs: policy.minUtteranceMs,
});

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
  precedingSegmentId: string | null,
  endpointingTrigger: Extract<TranscriptEvent, { type: 'final' }>['endpointingTrigger'],
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
        // IMPL-449: STT adapter が speech_final 等から正規化した値を使用。
        endpointingTrigger,
        precedingSegmentId,
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
    contextSegmentIds: readonly string[];
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
        contextSegmentIds: params.contextSegmentIds,
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
       * Runtime STT 切断時に `session.error (STT_STREAM_FAILED)` を一度だけ emit
       * するための guard。`handleAudioFrame` の sendFrame 失敗、および transcript
       * loop の予期しない終了の両方から共有する。session.start で再接続時に
       * reset する (新しい stream に対しては再度通知可能にする)。
       */
      let streamFailureNotified = false;
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

      // IMPL-447 / IMPL-404 / IMPL-448: JWT claims から endpointing / translationContext
      // を復元し、connection scope で保持する。`finalTail` は直近の確定字幕を
      // メモリ内に保持し、次 segment の翻訳 context として使う (永続層非アクセス)。
      const effectiveEndpointing = extractEndpointingFromClaims(context.tokenPayload.claims);
      const effectiveTranslationContext = extractTranslationContextFromClaims(
        context.tokenPayload.claims,
      );
      // Issue #123: JWT claims から glossary エントリを復元する。セッション中
      // 一定 (session.start 時点の snapshot) で、以降 `translate()` の request に
      // 添えて LLM プロンプト + 後処理置換に利用する。
      const effectiveGlossary = extractGlossaryFromClaims(context.tokenPayload.claims);
      const composeTranslationContext = createComposeTranslationContextUseCase();
      // 直近確定字幕の tail。maxSegments 以上に膨らむのを防ぐため、push のたびに
      // 末尾 maxSegments + 1 件に trim する (translation 応答で末尾を更新するため +1)。
      const finalTailCap = Math.max(effectiveTranslationContext.maxSegments, 0) + 1;
      let finalTail: PrecedingContext[] = [];
      const trimFinalTail = (): void => {
        if (finalTail.length > finalTailCap) {
          finalTail = finalTail.slice(finalTail.length - finalTailCap);
        }
      };

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
      // IMPL-460: hold-window (Option B feature flag)。
      // `holdWindowMs > 0` のとき、新 final 受信から一定時間内に別 final が
      // 届いたら、テキストを空白で連結して 1 回の translate() に統合する。
      // translation.final の sourceSegmentId は最後の final のもの、
      // contextSegmentIds は translate() が受けた precedingContext の ids を返す。
      let pendingTranslation: {
        // 発火対象の segmentIds (連結された順)
        segmentIds: readonly string[];
        // 連結済み source text
        text: string;
        sourceLanguage: string | null;
        targetLanguage: string;
        // merge 時に先頭 final で撮った precedingContext を再利用する
        precedingContext: readonly PrecedingContext[];
      } | null = null;
      let pendingTimer: ReturnType<typeof setTimeout> | null = null;

      const dispatchTranslation = async (
        snapshot: NonNullable<typeof pendingTranslation>,
      ): Promise<void> => {
        const finalSegmentId = snapshot.segmentIds[snapshot.segmentIds.length - 1] ?? '';
        const translationResult = await deps.translationPort.translate({
          text: snapshot.text,
          sourceLanguage: snapshot.sourceLanguage,
          targetLanguage: snapshot.targetLanguage,
          precedingContext: snapshot.precedingContext,
          glossary: effectiveGlossary,
        });
        if (translationResult.isErr()) {
          request.log.warn(
            {
              err: translationResult.error,
              segmentIds: snapshot.segmentIds,
            },
            'translation failed — skipping translation.final',
          );
          return;
        }
        const contextSegmentIds = translationResult.value.contextSegmentIds ?? [];
        emitTranslationFinal(socket, context, nextSequence, deps.clock, {
          translationId: translationIdFactory(),
          sourceSegmentId: finalSegmentId,
          text: translationResult.value.text,
          sourceLanguage: translationResult.value.detectedSourceLanguage,
          targetLanguage: snapshot.targetLanguage,
          latencyMs: translationResult.value.latencyMs,
          contextSegmentIds,
        });
        // merge 対象の全 segment に translatedText を反映する (次 final の
        // context に使えるよう)。複数 segment にも同じ訳文をコピーする。
        finalTail = finalTail.map((entry) =>
          snapshot.segmentIds.includes(entry.segmentId)
            ? { ...entry, translatedText: translationResult.value.text }
            : entry,
        );
      };

      const runTranscriptLoop = (stream: ActiveStream): void => {
        void (async () => {
          let iteratorThrew: unknown = null;
          try {
            for await (const event of stream.handle.events) {
              try {
                if (event.type === 'partial') {
                  emitTranscriptPartial(socket, context, nextSequence, deps.clock, event);
                  continue;
                }
                // IMPL-449: 直前の final が同じ接続内にあれば precedingSegmentId として
                // 付与する (overlay 連結表示用のヒント)。先頭 final は null。
                const precedingSegmentId =
                  finalTail.length === 0
                    ? null
                    : (finalTail[finalTail.length - 1]?.segmentId ?? null);
                emitTranscriptFinal(
                  socket,
                  context,
                  nextSequence,
                  deps.clock,
                  event,
                  precedingSegmentId,
                  event.endpointingTrigger,
                );

                // IMPL-404 / IMPL-448: 翻訳 context を組み立てる (maxSegments=0 なら空)。
                const precedingContext = composeTranslationContext({
                  finalTail,
                  maxSegments: effectiveTranslationContext.maxSegments,
                  includeTranslatedText: effectiveTranslationContext.includeTranslatedText,
                });

                // 新 final を finalTail に push (translatedText は後続の translate 応答で埋める)。
                const newEntry: PrecedingContext = {
                  segmentId: event.segmentId,
                  sourceText: event.text,
                  finalizedAt: event.finalizedAt,
                };
                finalTail = [...finalTail, newEntry];
                trimFinalTail();

                const holdWindowMs = effectiveTranslationContext.holdWindowMs;
                if (holdWindowMs <= 0) {
                  // 従来パス: 即時 translate 発火 (fire-and-forget)。
                  void dispatchTranslation({
                    segmentIds: [event.segmentId],
                    text: event.text,
                    sourceLanguage: stream.sourceLanguage,
                    targetLanguage: stream.targetLanguage,
                    precedingContext,
                  });
                  continue;
                }

                // IMPL-460: hold-window 有効時。既存 pending を cancel して新 final を
                // merge。precedingContext は merge 開始時点のものを固定利用する
                // (merge 対象 final を context に含めないため)。
                if (pendingTimer !== null) {
                  clearTimeout(pendingTimer);
                  pendingTimer = null;
                }
                pendingTranslation =
                  pendingTranslation === null
                    ? {
                        segmentIds: [event.segmentId],
                        text: event.text,
                        sourceLanguage: stream.sourceLanguage,
                        targetLanguage: stream.targetLanguage,
                        precedingContext,
                      }
                    : {
                        segmentIds: [...pendingTranslation.segmentIds, event.segmentId],
                        text: `${pendingTranslation.text} ${event.text}`,
                        sourceLanguage: pendingTranslation.sourceLanguage,
                        targetLanguage: pendingTranslation.targetLanguage,
                        precedingContext: pendingTranslation.precedingContext,
                      };
                const snapshotForTimer = pendingTranslation;
                pendingTimer = setTimeout(() => {
                  pendingTranslation = null;
                  pendingTimer = null;
                  void dispatchTranslation(snapshotForTimer);
                }, holdWindowMs);
              } catch (cause) {
                request.log.error({ err: cause }, 'transcript loop iteration failed');
              }
            }
          } catch (cause) {
            // iterator が throw した (Deepgram 側の error イベント等)。
            iteratorThrew = cause;
            request.log.warn({ err: cause }, 'transcript loop aborted by iterator error');
          }
          // stream 終了時に pending があれば強制 flush
          if (pendingTimer !== null) {
            clearTimeout(pendingTimer);
            pendingTimer = null;
          }
          if (pendingTranslation !== null) {
            const snapshot = pendingTranslation;
            pendingTranslation = null;
            void dispatchTranslation(snapshot);
          }
          // iterator が throw した場合のみクライアントへ通知する。
          // 正常終了 (iterator が finite に flush した) は通知しない —
          // Deepgram が無音終了で EOF を返す正常フローで false positive を
          // 避けるため。sendFrame 失敗パスの通知で zombie 状態は既に拾える。
          if (iteratorThrew !== null && activeStream === stream) {
            notifyStreamFailure('transcript stream aborted unexpectedly');
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
        // 新しい STT stream に対しては再度 STT_STREAM_FAILED を emit できる
        // ようにリセット (前回の stream クローズ通知と衝突しないよう guard)。
        streamFailureNotified = false;
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
            endpointing: toSttEndpointingConfig(effectiveEndpointing),
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
                let flushHitStreamFailure = false;
                for (const frame of pendingFrames) {
                  const flushResult = handle.sendFrame(frame);
                  if (flushResult.isErr()) {
                    request.log.warn(
                      { err: flushResult.error },
                      'stt sendFrame failed during pending flush',
                    );
                    // `deepgram-stream-closed` (実運用 close) と
                    // `deepgram-send-failed` (socket throw、e.g. CONNECTING 状態
                    // で send) の両方を recovery 経路に乗せる。openStream が
                    // 'open' を待つよう修正されたので後者は本来発生しないが
                    // defense-in-depth として残す。
                    if (
                      flushResult.error.kind === 'invariant-violation' &&
                      (flushResult.error.invariant === 'deepgram-stream-closed' ||
                        flushResult.error.invariant === 'deepgram-send-failed')
                    ) {
                      flushHitStreamFailure = true;
                    }
                  }
                }
                pendingFrames = [];
                if (flushHitStreamFailure) {
                  notifyStreamFailure('sendFrame failed during pending flush: STT stream unusable');
                }
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
          // Deepgram WebSocket がサーバ都合で閉じた (`deepgram-stream-closed`)、
          // または socket.send が throw した (`deepgram-send-failed`、e.g.
          // CONNECTING 状態で send) 場合は activeStream を null 化してクライアント
          // へ retryable エラーを一度だけ通知する。これにより拡張側は
          // session.stop → session.start で再接続できる。それ以外の transient
          // 送信失敗は WARN のみ。
          const isStreamUnusable =
            result.error.kind === 'invariant-violation' &&
            (result.error.invariant === 'deepgram-stream-closed' ||
              result.error.invariant === 'deepgram-send-failed');
          if (isStreamUnusable) {
            notifyStreamFailure('sendFrame failed: STT stream unusable');
          }
        }
      };

      /**
       * STT ストリームが運用中に閉じたことをクライアントへ一度だけ通知し、
       * activeStream を null 化する。二度目以降の呼び出しは no-op。
       * `streamFailureNotified` は次回 session.start で reset される。
       */
      const notifyStreamFailure = (reason: string): void => {
        if (streamFailureNotified) return;
        streamFailureNotified = true;
        if (activeStream !== null) {
          closeActiveStream();
        }
        sendSessionError(socket, context, nextSequence, deps.clock, {
          code: 'STT_STREAM_FAILED',
          message: reason,
          retryable: true,
          fatal: false,
        });
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
