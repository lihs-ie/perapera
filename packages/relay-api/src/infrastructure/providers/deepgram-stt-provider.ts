import { ResultAsync, err, errAsync, ok, okAsync, type Result } from 'neverthrow';
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
 */
export type DeepgramRawData = Buffer | ArrayBuffer | Buffer[];

export type DeepgramSocketEvent = 'message' | 'close' | 'error';
export type DeepgramSocketListener =
  | ((data: DeepgramRawData) => void)
  | (() => void)
  | ((err: Error) => void);

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

      let socket: MinimalDeepgramSocket;
      try {
        socket = config.webSocketFactory(url, {
          Authorization: `Token ${config.apiKey}`,
        });
      } catch (cause) {
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
          pushEvent({
            type: 'final',
            segmentId,
            text: transcript,
            language: streamConfig.sourceLanguage,
            startOffsetMs: startMs,
            endOffsetMs: endMs,
            finalizedAt: clock(),
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

      socket.on('close', endStream);
      socket.on('error', endStream);

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
            return ok(undefined);
          } catch (cause) {
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
      return okAsync<SttStreamHandle, DomainError>(handle);
    },
  };
};
