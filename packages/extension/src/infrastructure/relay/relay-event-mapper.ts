import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import { parseSessionIdentifier } from '../../domain/session/session-identifier';
import { parseSessionState } from '../../domain/session/session-state';
import { type DomainError, validationError } from '../../domain/shared/errors';
import { type RelayEvent } from '../../application/ports/relay-gateway';

/**
 * Relay API サーバーイベント (`api-specification.md` §6.3) を `RelayEvent`
 * discriminated union (application/ports) にマップする純粋パーサ。
 *
 * `session.pong` はハートビート応答で、`RelayEvent` に含まれない。この場合は
 * `ok(null)` で返し、呼び出し側が無視する。
 *
 * Zod で入力 validate し、既存ドメイン型 (SessionIdentifier / SessionState)
 * は対応する parse / create ヘルパを通す。
 */

const isoSchema = z.string().datetime();
const baseEnvelopeSchema = z.object({
  eventType: z.string(),
  sessionId: z.string(),
  sequence: z.number().int().nonnegative(),
  timestamp: isoSchema,
  payload: z.record(z.unknown()).optional().default({}),
});

// api-specification.md §6.3 `session.ready`:
// { state, heartbeatIntervalSec, acceptedAudio: {...} }
// Relay 側 `buildSessionReady` (server-events.ts) と shape 一致が必須。
// streamToken は POST /sessions レスポンス で既に取得済のためここでは送られない。
const readyPayload = z.object({
  state: z.string(),
  heartbeatIntervalSec: z.number().positive(),
});

const transcriptPartialPayload = z.object({
  segmentId: z.string().min(1),
  revision: z.number().int().positive(),
  text: z.string().min(1),
  language: z.string().optional(),
  startOffsetMs: z.number().int().nonnegative().optional(),
  endOffsetMs: z.number().int().nonnegative().optional(),
});

const transcriptFinalPayload = z.object({
  segmentId: z.string().min(1),
  text: z.string().min(1),
  finalizedAt: isoSchema,
});

// Relay `buildTranslationFinal` は DeepL の `detectedSourceLanguage` を
// そのまま載せる (`string | null`) ため、null 許容が必須。また DeepL が無音 /
// 極短セグメントで空文字列 text を返すケースがあるため、text も min 制約を
// 外して受け取り、空なら UI 層で skip する (hot path を止めない)。
const translationFinalPayload = z.object({
  translationId: z.string().min(1),
  sourceSegmentId: z.string().min(1),
  text: z.string(),
  targetLanguage: z.string().min(1),
  sourceLanguage: z.string().nullable().optional(),
});

const stateChangedPayload = z.object({
  currentState: z.string(),
  previousState: z.string().optional(),
  reason: z.string().optional(),
});

const sessionErrorPayload = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  retryable: z.boolean(),
  fatal: z.boolean(),
});

const asValidation = (message: string): DomainError =>
  validationError({ field: 'RelayServerMessage', message });

/**
 * WebSocket 受信メッセージを parse。
 * - `session.pong` → `ok(null)`
 * - 他の既知イベント → `ok(RelayEvent)`
 * - 未知 eventType / schema 違反 / JSON パース失敗 → `err(validationError)`
 */
export const parseRelayServerMessage = (raw: string): Result<RelayEvent | null, DomainError> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    return err(
      asValidation(`JSON parse failed: ${cause instanceof Error ? cause.message : 'unknown'}`),
    );
  }

  const envelopeResult = baseEnvelopeSchema.safeParse(parsed);
  if (!envelopeResult.success) {
    return err(asValidation(envelopeResult.error.issues.map((i) => i.message).join('; ')));
  }
  const envelope = envelopeResult.data;

  const sessionIdentifierResult = parseSessionIdentifier(envelope.sessionId);
  if (sessionIdentifierResult.isErr()) {
    return err(sessionIdentifierResult.error);
  }
  const sessionIdentifier = sessionIdentifierResult.value;

  switch (envelope.eventType) {
    case 'session.pong':
      return ok(null);

    case 'session.ready': {
      const payload = readyPayload.safeParse(envelope.payload);
      if (!payload.success) {
        return err(asValidation(payload.error.issues.map((i) => i.message).join('; ')));
      }
      return ok({
        type: 'session.ready',
        sessionIdentifier,
        heartbeatIntervalSec: payload.data.heartbeatIntervalSec,
      });
    }

    case 'transcript.partial': {
      const payload = transcriptPartialPayload.safeParse(envelope.payload);
      if (!payload.success) {
        return err(asValidation(payload.error.issues.map((i) => i.message).join('; ')));
      }
      return ok({
        type: 'transcript.partial',
        sessionIdentifier,
        segmentIdentifier: payload.data.segmentId,
        revision: payload.data.revision,
        text: payload.data.text,
      });
    }

    case 'transcript.final': {
      const payload = transcriptFinalPayload.safeParse(envelope.payload);
      if (!payload.success) {
        return err(asValidation(payload.error.issues.map((i) => i.message).join('; ')));
      }
      return ok({
        type: 'transcript.final',
        sessionIdentifier,
        segmentIdentifier: payload.data.segmentId,
        text: payload.data.text,
        finalizedAt: payload.data.finalizedAt,
      });
    }

    case 'translation.final': {
      const payload = translationFinalPayload.safeParse(envelope.payload);
      if (!payload.success) {
        return err(asValidation(payload.error.issues.map((i) => i.message).join('; ')));
      }
      return ok({
        type: 'translation.final',
        sessionIdentifier,
        segmentIdentifier: payload.data.sourceSegmentId,
        translationIdentifier: payload.data.translationId,
        targetLanguage: payload.data.targetLanguage,
        text: payload.data.text,
      });
    }

    case 'session.state.changed': {
      const payload = stateChangedPayload.safeParse(envelope.payload);
      if (!payload.success) {
        return err(asValidation(payload.error.issues.map((i) => i.message).join('; ')));
      }
      const stateResult = parseSessionState(payload.data.currentState);
      if (stateResult.isErr()) return err(stateResult.error);
      return ok({
        type: 'session.state.changed',
        sessionIdentifier,
        state: stateResult.value,
      });
    }

    case 'session.error': {
      const payload = sessionErrorPayload.safeParse(envelope.payload);
      if (!payload.success) {
        return err(asValidation(payload.error.issues.map((i) => i.message).join('; ')));
      }
      return ok({
        type: 'session.error',
        sessionIdentifier,
        code: payload.data.code,
        message: payload.data.message,
        retryable: payload.data.retryable,
        fatal: payload.data.fatal,
      });
    }

    default:
      return err(asValidation(`unknown eventType: ${envelope.eventType}`));
  }
};
