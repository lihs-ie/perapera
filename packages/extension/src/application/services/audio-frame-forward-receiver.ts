import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import { z } from 'zod';
import { parseSessionIdentifier } from '../../domain/session/session-identifier';
import { validationError, type DomainError } from '../../domain/shared/errors';
import { type AudioFrameEnvelope } from '../ports/audio-preprocessor';
import { type RelayGateway } from '../ports/relay-gateway';

/**
 * IMPL-618 AudioFrameForwardReceiver (application service)。
 *
 * Offscreen document から `chrome.runtime.sendMessage({
 *   type: 'audio.frame.forward',
 *   sessionIdentifier: <ulid>,
 *   data: { type: 'audio.frame', pcm16Base64, sequenceNumber, ... }
 * })` で送信される message を SW 側で受信し、`RelayGateway.sendAudioFrame`
 * に流す receiver。
 *
 * worklet processor (IMPL-607) が出す frame 形式と Relay API の
 * `AudioFrameEnvelope` はほぼ一致しており、本 service は薄い validator +
 * forwarder として機能する。
 *
 * **本番実装で mock を使わない設計**:
 * - `relayGateway` は必須 DI (default なし)
 * - test では fake gateway を注入
 */

// worklet processor が port.postMessage で送信するペイロード (IMPL-607)
const audioFrameDataSchema = z.object({
  type: z.literal('audio.frame'),
  sequenceNumber: z.number().int().nonnegative(),
  sampleRate: z.literal(16000),
  channels: z.literal(1),
  pcm16Base64: z.string().min(1),
  capturedAt: z.string().datetime(),
  durationMs: z.number().int().positive(),
});

const audioFrameForwardSchema = z.object({
  type: z.literal('audio.frame.forward'),
  sessionIdentifier: z.string().min(1),
  data: audioFrameDataSchema,
});

/**
 * `chrome.runtime.sendMessage` 経由で受け取った任意の unknown を
 * `AudioFrameForwardMessage` として解釈できるかを検査する。
 * 本 message type でなければ `null` を返し、receiver 側で silent ignore する。
 */
export const tryParseAudioFrameForwardMessage = (
  raw: unknown,
): { readonly type: 'audio.frame.forward'; readonly envelope: AudioFrameEnvelope } | null => {
  if (raw === null || typeof raw !== 'object' || !('type' in raw)) return null;
  const maybeType: unknown = Reflect.get(raw, 'type');
  if (maybeType !== 'audio.frame.forward') return null;
  const parsed = audioFrameForwardSchema.safeParse(raw);
  if (!parsed.success) return null;
  const sessionResult = parseSessionIdentifier(parsed.data.sessionIdentifier);
  if (sessionResult.isErr()) return null;
  return {
    type: 'audio.frame.forward',
    envelope: {
      sessionIdentifier: sessionResult.value,
      sequenceNumber: parsed.data.data.sequenceNumber,
      sampleRate: parsed.data.data.sampleRate,
      channels: parsed.data.data.channels,
      pcm16Base64: parsed.data.data.pcm16Base64,
      capturedAt: parsed.data.data.capturedAt,
      durationMs: parsed.data.data.durationMs,
    },
  };
};

export type AudioFrameForwardReceiver = Readonly<{
  /**
   * 任意の `chrome.runtime.onMessage` message を受け取り、`audio.frame.forward`
   * に該当すれば `RelayGateway.sendAudioFrame` に流す。該当しなければ
   * silent ignore (他 message type との listener 共有を想定)。
   * 返り値の Result は test / smoke 検証用で、本番 onMessage では無視可。
   */
  receive: (rawMessage: unknown) => ResultAsync<'forwarded' | 'ignored', DomainError>;
}>;

export type AudioFrameForwardReceiverDependencies = Readonly<{
  relayGateway: RelayGateway;
  /** Err ログ sink。default console.warn */
  logWarn?: (message: string) => void;
}>;

const defaultLogWarn = (message: string): void => {
  console.warn(message);
};

export const createAudioFrameForwardReceiver = (
  deps: AudioFrameForwardReceiverDependencies,
): AudioFrameForwardReceiver => {
  const logWarn = deps.logWarn ?? defaultLogWarn;
  const frameCountBySession = new Map<string, number>();
  return {
    receive: (rawMessage) => {
      const parsed = tryParseAudioFrameForwardMessage(rawMessage);
      if (parsed === null) {
        // 他 message type との listener 共有のため null は silent ignore が基本。
        // ただし type 自体が audio.frame.forward なのに parse に失敗している
        // 場合は schema drift / sessionIdentifier 不正が疑わしいので warn 化。
        if (
          typeof rawMessage === 'object' &&
          rawMessage !== null &&
          'type' in rawMessage &&
          Reflect.get(rawMessage, 'type') === 'audio.frame.forward'
        ) {
          console.warn(
            '[audio-frame-forward-receiver] schema parse failed for audio.frame.forward — dropping',
            rawMessage,
          );
        }
        return okAsync<'forwarded' | 'ignored', DomainError>('ignored');
      }
      const sessionId = parsed.envelope.sessionIdentifier;
      const prev = frameCountBySession.get(sessionId) ?? 0;
      const next = prev + 1;
      frameCountBySession.set(sessionId, next);
      if (next === 1) {
        console.log(
          `[audio-frame-forward-receiver] FIRST frame received for ${sessionId} — forwarding to relay`,
        );
      } else if (next % 50 === 0) {
        console.log(
          `[audio-frame-forward-receiver] frames forwarded for ${sessionId}: ${String(next)}`,
        );
      }
      return deps.relayGateway
        .sendAudioFrame(parsed.envelope)
        .map((): 'forwarded' | 'ignored' => 'forwarded')
        .orElse((error): ResultAsync<'forwarded' | 'ignored', DomainError> => {
          logWarn(
            `[perapera] audio-frame-forward-receiver sendAudioFrame failed for ${sessionId}: ${
              'kind' in error ? error.kind : String(error)
            }`,
          );
          return errAsync<'forwarded' | 'ignored', DomainError>(error);
        });
    },
  };
};

// re-export type for convenience (application 層が schema 的な型情報に触れずに済む)
export type AudioFrameDataPayload = z.infer<typeof audioFrameDataSchema>;

// 未使用を防ぐため validationError を内部 doc に残す (schema 検証失敗時の
// 将来的な詳細ログ用、現状は null 返却で silent ignore)
void validationError;
