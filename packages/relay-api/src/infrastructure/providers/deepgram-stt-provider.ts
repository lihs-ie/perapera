import { ResultAsync, err, errAsync, ok, type Result } from 'neverthrow';
import { ulid } from 'ulid';
import {
  type SttPort,
  type SttStreamHandle,
  type TranscriptEvent,
} from '../../application/ports/stt-port';
import { invariantViolationError, type DomainError } from '../../domain/shared/errors';

/**
 * Deepgram adapter が使う最小の WebSocket contract。
 * - `ws` パッケージの `WebSocket` はこの interface を自然に満たす
 * - test では EventEmitter ベースの fake が直接渡せる
 *
 * `ws` の `close` event は `(code: number, reason: Buffer)` を渡してくる。
 * `error` event は `(err: Error)` を渡す。診断ログのため両方の引数を受け取れる
 * shape にしている (test fake は引数を渡さなくてもよい)。
 */
export type DeepgramRawData = Buffer | ArrayBuffer | Buffer[];

export type DeepgramSocketEvent = 'message' | 'close' | 'error' | 'open' | 'unexpected-response';
export type DeepgramSocketListener =
  | ((data: DeepgramRawData) => void)
  | (() => void)
  | ((err: Error) => void)
  | ((code: number, reason: Buffer) => void)
  | ((req: unknown, res: unknown) => void);

export type MinimalDeepgramSocket = Readonly<{
  on: (event: DeepgramSocketEvent, listener: DeepgramSocketListener) => unknown;
  once: (event: 'close', listener: () => void) => unknown;
  send: (data: Buffer, options: { binary: boolean }) => void;
  close: (code: number, reason: string) => void;
}>;

/**
 * IMPL-444 Deepgram STT provider (DD-412)。
 *
 * `wss://api.deepgram.com/v1/listen` に対して WebSocket で接続し、
 * PCM16 16kHz モノラルの音声フレーム (base64 decode) を binary message で
 * 送信する。Deepgram からは JSON の transcript イベントが返ってくる。
 *
 * **Mock ではない本番実装**。`webSocketFactory` を DI で注入し、test では
 * fake WebSocket を渡して deterministic に検証する。production は `ws` パッケージ
 * の `WebSocket` を渡す (server.ts で配線)。
 */
export type DeepgramWebSocketFactory = (
  url: string,
  headers: Record<string, string>,
) => MinimalDeepgramSocket;

/**
 * 診断ログハンドラ (DI、test では no-op)。production は pino logger を渡す。
 * fatal な失敗 (auth fail、format mismatch 等) を WARN/ERROR で記録するため。
 */
export type DeepgramLogger = Readonly<{
  info: (msg: string, fields?: Record<string, unknown>) => void;
  warn: (msg: string, fields?: Record<string, unknown>) => void;
  error: (msg: string, fields?: Record<string, unknown>) => void;
}>;

const NOOP_LOGGER: DeepgramLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

export type DeepgramSttProviderConfig = Readonly<{
  apiKey: string;
  /** 既定 `wss://api.deepgram.com/v1/listen`。テストで上書き可能 */
  baseUrl?: string;
  /** 既定 `nova-2`。Deepgram model 名 */
  model?: string;
  webSocketFactory: DeepgramWebSocketFactory;
  /** ULID 生成器 (test で deterministic に) */
  segmentIdFactory?: () => string;
  /** ISO8601 now (test で deterministic に) */
  clock?: () => string;
  /** 診断ログ (close code / error reason の捕捉)。未指定は no-op (既存テスト互換) */
  logger?: DeepgramLogger;
  /**
   * WebSocket 'open' event 待機タイムアウト (既定 5000ms)。
   * これを超えると `deepgram-open-timeout` で reject。test では短縮可能。
   */
  openTimeoutMs?: number;
}>;

type DeepgramMessageAlternative = {
  transcript?: string;
};
type DeepgramMessage = {
  type?: string;
  channel?: {
    alternatives?: DeepgramMessageAlternative[];
  };
  is_final?: boolean;
  /** Deepgram: silence detection で文末と判定 (utterance boundary) */
  speech_final?: boolean;
  start?: number;
  duration?: number;
};

const extractString = (obj: Record<string, unknown>, key: string): string | undefined => {
  const value = obj[key];
  return typeof value === 'string' ? value : undefined;
};

const extractBoolean = (obj: Record<string, unknown>, key: string): boolean | undefined => {
  const value = obj[key];
  return typeof value === 'boolean' ? value : undefined;
};

const extractNumber = (obj: Record<string, unknown>, key: string): number | undefined => {
  const value = obj[key];
  return typeof value === 'number' ? value : undefined;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const parseDeepgramMessage = (raw: string): DeepgramMessage | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(parsed)) return null;
  const message: DeepgramMessage = {};
  const type = extractString(parsed, 'type');
  if (type !== undefined) message.type = type;
  const channelRaw = parsed['channel'];
  if (isObject(channelRaw)) {
    const altsRaw = channelRaw['alternatives'];
    if (Array.isArray(altsRaw)) {
      const alts: DeepgramMessageAlternative[] = [];
      for (const entry of altsRaw) {
        if (isObject(entry)) {
          const alt: DeepgramMessageAlternative = {};
          const transcript = extractString(entry, 'transcript');
          if (transcript !== undefined) alt.transcript = transcript;
          alts.push(alt);
        }
      }
      message.channel = { alternatives: alts };
    } else {
      message.channel = {};
    }
  }
  const isFinal = extractBoolean(parsed, 'is_final');
  if (isFinal !== undefined) message.is_final = isFinal;
  const speechFinal = extractBoolean(parsed, 'speech_final');
  if (speechFinal !== undefined) message.speech_final = speechFinal;
  const start = extractNumber(parsed, 'start');
  if (start !== undefined) message.start = start;
  const duration = extractNumber(parsed, 'duration');
  if (duration !== undefined) message.duration = duration;
  return message;
};

const rawToString = (data: DeepgramRawData): string => {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  return Buffer.from(data).toString('utf8');
};

export const createDeepgramSttProvider = (config: DeepgramSttProviderConfig): SttPort => {
  if (config.apiKey.length === 0) {
    throw new Error('createDeepgramSttProvider: apiKey must be non-empty');
  }
  const baseUrl = config.baseUrl ?? 'wss://api.deepgram.com/v1/listen';
  const model = config.model ?? 'nova-2';
  const segmentIdFactory = config.segmentIdFactory ?? (() => ulid());
  const clock = config.clock ?? (() => new Date().toISOString());
  const logger = config.logger ?? NOOP_LOGGER;
  const openTimeoutMs = config.openTimeoutMs ?? 5000;

  return {
    openStream: (streamConfig) => {
      const qs = new URLSearchParams({
        encoding: 'linear16',
        sample_rate: '16000',
        channels: '1',
        interim_results: 'true',
        smart_format: 'true',
        model,
      });
      if (streamConfig.autoDetectLanguage) {
        qs.set('detect_language', 'true');
      } else if (streamConfig.sourceLanguage !== null) {
        qs.set('language', streamConfig.sourceLanguage);
      }
      // IMPL-447 (DD-412): endpointing 設定を Deepgram 固有パラメータへマップ。
      // Deepgram は `endpointing` (ms) と `utterance_end_ms` を受け取る。
      // `punctuate` は `smart_format=true` と組み合わせて句読点付与を強化する。
      if (streamConfig.endpointing !== undefined) {
        qs.set('endpointing', String(streamConfig.endpointing.silenceThresholdMs));
        qs.set('utterance_end_ms', String(streamConfig.endpointing.minUtteranceMs));
        qs.set('punctuate', streamConfig.endpointing.punctuationAware ? 'true' : 'false');
      }
      const url = `${baseUrl}?${qs.toString()}`;

      // 診断: URL の query string は秘密ではないが API key は header で送るため
      // ログには含まれない。auth fail / format mismatch を切り分けるため
      // 接続パラメータを INFO で残す。
      logger.info('deepgram open: connecting', {
        url: baseUrl,
        model,
        sourceLanguage: streamConfig.sourceLanguage,
        autoDetectLanguage: streamConfig.autoDetectLanguage,
        endpointing: streamConfig.endpointing,
      });

      let socket: MinimalDeepgramSocket;
      try {
        socket = config.webSocketFactory(url, {
          Authorization: `Token ${config.apiKey}`,
        });
      } catch (cause) {
        logger.error('deepgram open: webSocketFactory threw', {
          err: cause instanceof Error ? cause.message : String(cause),
        });
        return errAsync<SttStreamHandle, DomainError>(
          invariantViolationError({
            invariant: 'deepgram-ws-open-failed',
            details: cause instanceof Error ? cause.message : 'unknown ws open error',
          }),
        );
      }

      let pendingSegmentId: string | null = null;
      let partialRevision = 0;
      const eventQueue: TranscriptEvent[] = [];
      const waiters: ((event: IteratorResult<TranscriptEvent>) => void)[] = [];
      let closed = false;
      let frameCount = 0;

      const pushEvent = (event: TranscriptEvent): void => {
        const waiter = waiters.shift();
        if (waiter !== undefined) waiter({ done: false, value: event });
        else eventQueue.push(event);
      };

      const endStream = (): void => {
        if (closed) return;
        closed = true;
        const waiter = waiters.shift();
        if (waiter !== undefined) waiter({ done: true, value: undefined });
      };

      socket.on('message', (raw: DeepgramRawData) => {
        const parsed = parseDeepgramMessage(rawToString(raw));
        if (parsed === null) return;
        const transcript = parsed.channel?.alternatives?.[0]?.transcript ?? '';
        if (transcript.length === 0) return;
        const startMs = Math.round((parsed.start ?? 0) * 1000);
        const durMs = Math.round((parsed.duration ?? 0) * 1000);
        const endMs = startMs + durMs;
        if (parsed.is_final === true) {
          const segmentId = pendingSegmentId ?? segmentIdFactory();
          // IMPL-449: Deepgram の `speech_final=true` は silence detection で
          // 文末と判定したことを意味するため `'silence'` に mapping。
          // それ以外は is_final=true のみで、Deepgram が max-segment や句読点
          // などで切った可能性があるが、本 SDK の信号としては区別不能のため
          // `'provider_default'` に落とす。
          const endpointingTrigger: TranscriptEvent extends infer E
            ? E extends { endpointingTrigger: infer T }
              ? T
              : never
            : never = parsed.speech_final === true ? 'silence' : 'provider_default';
          pushEvent({
            type: 'final',
            segmentId,
            text: transcript,
            language: streamConfig.sourceLanguage,
            startOffsetMs: startMs,
            endOffsetMs: endMs,
            finalizedAt: clock(),
            endpointingTrigger,
          });
          pendingSegmentId = null;
          partialRevision = 0;
          return;
        }
        if (pendingSegmentId === null) {
          pendingSegmentId = segmentIdFactory();
          partialRevision = 0;
        }
        partialRevision += 1;
        pushEvent({
          type: 'partial',
          segmentId: pendingSegmentId,
          revision: partialRevision,
          text: transcript,
          language: streamConfig.sourceLanguage,
          startOffsetMs: startMs,
          endOffsetMs: endMs,
        });
      });

      const handle: SttStreamHandle = {
        sendFrame: (params): Result<void, DomainError> => {
          if (closed) {
            return err(
              invariantViolationError({
                invariant: 'deepgram-stream-closed',
                details: 'attempted to send frame on closed stream',
              }),
            );
          }
          try {
            const binary = Buffer.from(params.audioBase64, 'base64');
            socket.send(binary, { binary: true });
            frameCount += 1;
            if (frameCount === 1) {
              logger.info('deepgram sendFrame: first frame', {
                bytes: binary.length,
                chunkId: params.chunkId,
              });
            }
            return ok(undefined);
          } catch (cause) {
            logger.warn('deepgram sendFrame: socket.send threw', {
              err: cause instanceof Error ? cause.message : String(cause),
              framesSent: frameCount,
            });
            return err(
              invariantViolationError({
                invariant: 'deepgram-send-failed',
                details: cause instanceof Error ? cause.message : 'unknown send error',
              }),
            );
          }
        },
        close: () => {
          endStream();
          return ResultAsync.fromPromise(
            new Promise<void>((resolve) => {
              socket.once('close', () => resolve());
              try {
                socket.close(1000, 'client close');
              } catch {
                resolve();
              }
            }),
            (cause) =>
              invariantViolationError({
                invariant: 'deepgram-close-failed',
                details: cause instanceof Error ? cause.message : 'unknown close error',
              }),
          );
        },
        events: {
          [Symbol.asyncIterator]: () => ({
            next: (): Promise<IteratorResult<TranscriptEvent>> => {
              if (eventQueue.length > 0) {
                const event = eventQueue.shift();
                if (event !== undefined) {
                  return Promise.resolve({ done: false, value: event });
                }
              }
              if (closed) {
                return Promise.resolve({ done: true, value: undefined });
              }
              return new Promise<IteratorResult<TranscriptEvent>>((resolve) => {
                waiters.push(resolve);
              });
            },
          }),
        },
      };

      // openStream contract: handle が返る時点で socket は send 可能 (readyState=1)
      // でなければならない。WebSocket の 'open' event を待ってから resolve し、
      // 'error' / 'unexpected-response' / timeout の場合は err で reject する。
      // open 後に発火する 'close' / 'error' は endStream() を駆動 (運用中の終了検出)。
      const openPromise = new Promise<Result<SttStreamHandle, DomainError>>((resolve) => {
        let openSettled = false;
        const settleOpen = (result: Result<SttStreamHandle, DomainError>): void => {
          if (openSettled) return;
          openSettled = true;
          clearTimeout(openTimer);
          resolve(result);
        };
        const openTimer = setTimeout(() => {
          logger.error('deepgram open: timeout', {
            timeoutMs: openTimeoutMs,
            sourceLanguage: streamConfig.sourceLanguage,
            autoDetectLanguage: streamConfig.autoDetectLanguage,
          });
          settleOpen(
            err(
              invariantViolationError({
                invariant: 'deepgram-open-timeout',
                details: `WebSocket open timeout ${String(openTimeoutMs)}ms`,
              }),
            ),
          );
          // socket がまだ CONNECTING の場合に resource leak を防ぐ
          try {
            socket.close(1000, 'open timeout');
          } catch {
            /* ignore */
          }
        }, openTimeoutMs);

        const onOpen: () => void = () => {
          logger.info('deepgram open: WebSocket established', {
            framesQueued: eventQueue.length,
          });
          settleOpen(ok(handle));
        };
        const onClose: (code: number, reason: Buffer) => void = (code, reason) => {
          const reasonStr = Buffer.isBuffer(reason) ? reason.toString('utf8') : '';
          // 1000 = normal、それ以外は異常終了。Deepgram 固有 code (4000-4999) は
          // auth/billing/format mismatch などを示すので必ず WARN/ERROR。
          const fields = {
            code,
            reason: reasonStr,
            framesSent: frameCount,
            sourceLanguage: streamConfig.sourceLanguage,
            autoDetectLanguage: streamConfig.autoDetectLanguage,
          };
          if (code === 1000) {
            logger.info('deepgram close: normal closure', fields);
          } else if (code >= 4000) {
            logger.error('deepgram close: provider-specific error code', fields);
          } else {
            logger.warn('deepgram close: abnormal closure', fields);
          }
          // open 前に閉じたら open failure として扱う
          if (!openSettled) {
            settleOpen(
              err(
                invariantViolationError({
                  invariant: 'deepgram-open-failed',
                  details: `WebSocket closed before open (code=${String(code)}${reasonStr.length > 0 ? `, reason=${reasonStr}` : ''})`,
                }),
              ),
            );
          }
          endStream();
        };
        const onError: (err: Error) => void = (cause) => {
          logger.error('deepgram error', {
            err: cause instanceof Error ? cause.message : String(cause),
            framesSent: frameCount,
          });
          if (!openSettled) {
            settleOpen(
              err(
                invariantViolationError({
                  invariant: 'deepgram-open-failed',
                  details: cause instanceof Error ? cause.message : 'unknown error before open',
                }),
              ),
            );
            return;
          }
          endStream();
        };
        const onUnexpectedResponse: (req: unknown, res: unknown) => void = (_req, res) => {
          // ws の unexpected-response: HTTP upgrade が拒否された (status>=400)。
          // auth fail (401) / quota (403) / bad request (400) などをここで捕捉する。
          const statusCode =
            typeof res === 'object' && res !== null && 'statusCode' in res
              ? Reflect.get(res, 'statusCode')
              : 'unknown';
          logger.error('deepgram open: HTTP upgrade rejected', {
            statusCode,
          });
          settleOpen(
            err(
              invariantViolationError({
                invariant: 'deepgram-open-rejected',
                details: `HTTP ${typeof statusCode === 'number' ? String(statusCode) : 'unknown'}`,
              }),
            ),
          );
        };

        socket.on('open', onOpen);
        socket.on('close', onClose);
        socket.on('error', onError);
        socket.on('unexpected-response', onUnexpectedResponse);
      });

      return new ResultAsync(openPromise);
    },
  };
};
