import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import { invariantViolationError, type DomainError } from '../../domain/shared/errors';

/**
 * クライアント送信イベント (api-specification §6.2)。
 *
 * 全イベント共通の envelope:
 * - eventType: 識別子
 * - sessionId: セッション ID
 * - sequence: クライアント単調増加 integer
 * - timestamp: ISO 8601
 * - payload: 型別ペイロード
 *
 * zod discriminated union で eventType を key にパースする。
 */

const envelopeBase = z.object({
  sessionId: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  timestamp: z.string().datetime(),
});

const sessionStartPayload = z.object({
  sourceLanguage: z.string().nullable().optional(),
  autoDetectLanguage: z.boolean(),
  targetLanguage: z.string(),
  translationEnabled: z.boolean(),
});

const audioFramePayload = z.object({
  chunkId: z.string().min(1),
  audioBase64: z.string().min(1),
  encoding: z.literal('pcm_s16le'),
  sampleRateHz: z.literal(16000),
  channels: z.literal(1),
  frameDurationMs: z.literal(100),
  capturedAt: z.string().datetime(),
});

const reasonPayload = z.object({
  reason: z.string().optional(),
});

const emptyPayload = z.object({}).strict();

const clientEventSchema = z.discriminatedUnion('eventType', [
  envelopeBase.extend({
    eventType: z.literal('session.start'),
    payload: sessionStartPayload,
  }),
  envelopeBase.extend({
    eventType: z.literal('audio.frame'),
    payload: audioFramePayload,
  }),
  envelopeBase.extend({
    eventType: z.literal('session.pause'),
    payload: reasonPayload,
  }),
  envelopeBase.extend({
    eventType: z.literal('session.resume'),
    payload: reasonPayload,
  }),
  envelopeBase.extend({
    eventType: z.literal('session.stop'),
    payload: reasonPayload,
  }),
  envelopeBase.extend({
    eventType: z.literal('session.ping'),
    payload: emptyPayload,
  }),
]);

export type ClientEvent = z.infer<typeof clientEventSchema>;

export type ClientEventType = ClientEvent['eventType'];

/**
 * 受信 raw (string / Buffer) を ClientEvent にパースする。
 *
 * 失敗時は `invariantViolationError` を返す:
 * - `invariant: 'client-event-invalid-json'`: JSON parse 失敗
 * - `invariant: 'client-event-validation'`: Zod 検証失敗
 */
export const parseClientEvent = (raw: string): Result<ClientEvent, DomainError> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    return err(
      invariantViolationError({
        invariant: 'client-event-invalid-json',
        details: cause instanceof Error ? cause.message : 'JSON parse error',
      }),
    );
  }
  const result = clientEventSchema.safeParse(parsed);
  if (!result.success) {
    return err(
      invariantViolationError({
        invariant: 'client-event-validation',
        details: result.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; '),
      }),
    );
  }
  return ok(result.data);
};
