/**
 * サーバー送信イベント builder (api-specification §6.3)。
 *
 * 全イベント共通 envelope:
 * - eventType: 識別子
 * - sessionId: セッション ID
 * - sequence: サーバー側の monotonically-increasing 番号 (connection 毎に採番)
 * - timestamp: ISO 8601 (サーバー発行時刻)
 * - payload: 型別
 *
 * 本 module は JSON 文字列化した wire format を builder 経由で生成する。
 * sequence 管理は呼び出し側 (relay-route) で connection-scoped に行う。
 */

export type ServerEventEnvelope = Readonly<{
  eventType: string;
  sessionId: string;
  sequence: number;
  timestamp: string;
  payload: Readonly<Record<string, unknown>>;
}>;

export type SessionReadyPayload = Readonly<{
  state: 'capturing';
  heartbeatIntervalSec: number;
  acceptedAudio: Readonly<{
    transport: 'json-base64';
    sampleRateHz: 16000;
    channels: 1;
    frameDurationMs: 100;
  }>;
}>;

export const buildSessionReady = (params: {
  sessionId: string;
  sequence: number;
  timestamp: string;
  heartbeatIntervalSec: number;
}): ServerEventEnvelope => ({
  eventType: 'session.ready',
  sessionId: params.sessionId,
  sequence: params.sequence,
  timestamp: params.timestamp,
  payload: {
    state: 'capturing',
    heartbeatIntervalSec: params.heartbeatIntervalSec,
    acceptedAudio: {
      transport: 'json-base64',
      sampleRateHz: 16000,
      channels: 1,
      frameDurationMs: 100,
    },
  } satisfies SessionReadyPayload,
});

export const buildSessionPong = (params: {
  sessionId: string;
  sequence: number;
  timestamp: string;
}): ServerEventEnvelope => ({
  eventType: 'session.pong',
  sessionId: params.sessionId,
  sequence: params.sequence,
  timestamp: params.timestamp,
  payload: {},
});

export type TranscriptPartialPayload = Readonly<{
  segmentId: string;
  revision: number;
  text: string;
  language: string | null;
  startOffsetMs: number;
  endOffsetMs: number;
}>;

export const buildTranscriptPartial = (params: {
  sessionId: string;
  sequence: number;
  timestamp: string;
  segmentId: string;
  revision: number;
  text: string;
  language: string | null;
  startOffsetMs: number;
  endOffsetMs: number;
}): ServerEventEnvelope => ({
  eventType: 'transcript.partial',
  sessionId: params.sessionId,
  sequence: params.sequence,
  timestamp: params.timestamp,
  payload: {
    segmentId: params.segmentId,
    revision: params.revision,
    text: params.text,
    language: params.language,
    startOffsetMs: params.startOffsetMs,
    endOffsetMs: params.endOffsetMs,
  } satisfies TranscriptPartialPayload,
});

export type TranscriptFinalPayload = Readonly<{
  segmentId: string;
  text: string;
  language: string | null;
  startOffsetMs: number;
  endOffsetMs: number;
  finalizedAt: string;
}>;

export const buildTranscriptFinal = (params: {
  sessionId: string;
  sequence: number;
  timestamp: string;
  segmentId: string;
  text: string;
  language: string | null;
  startOffsetMs: number;
  endOffsetMs: number;
  finalizedAt: string;
}): ServerEventEnvelope => ({
  eventType: 'transcript.final',
  sessionId: params.sessionId,
  sequence: params.sequence,
  timestamp: params.timestamp,
  payload: {
    segmentId: params.segmentId,
    text: params.text,
    language: params.language,
    startOffsetMs: params.startOffsetMs,
    endOffsetMs: params.endOffsetMs,
    finalizedAt: params.finalizedAt,
  } satisfies TranscriptFinalPayload,
});

export type TranslationFinalPayload = Readonly<{
  translationId: string;
  sourceSegmentId: string;
  text: string;
  sourceLanguage: string | null;
  targetLanguage: string;
  latencyMs: number;
}>;

export const buildTranslationFinal = (params: {
  sessionId: string;
  sequence: number;
  timestamp: string;
  translationId: string;
  sourceSegmentId: string;
  text: string;
  sourceLanguage: string | null;
  targetLanguage: string;
  latencyMs: number;
}): ServerEventEnvelope => ({
  eventType: 'translation.final',
  sessionId: params.sessionId,
  sequence: params.sequence,
  timestamp: params.timestamp,
  payload: {
    translationId: params.translationId,
    sourceSegmentId: params.sourceSegmentId,
    text: params.text,
    sourceLanguage: params.sourceLanguage,
    targetLanguage: params.targetLanguage,
    latencyMs: params.latencyMs,
  } satisfies TranslationFinalPayload,
});

export type SessionErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_STATE_TRANSITION'
  | 'SESSION_NOT_READY'
  | 'RATE_LIMIT_EXCEEDED'
  | 'INTERNAL_ERROR'
  | 'STT_ERROR'
  | 'TRANSLATION_ERROR';

export type SessionErrorPayload = Readonly<{
  code: SessionErrorCode;
  message: string;
  retryable: boolean;
  fatal: boolean;
}>;

export const buildSessionError = (params: {
  sessionId: string;
  sequence: number;
  timestamp: string;
  code: SessionErrorCode;
  message: string;
  retryable: boolean;
  fatal: boolean;
}): ServerEventEnvelope => ({
  eventType: 'session.error',
  sessionId: params.sessionId,
  sequence: params.sequence,
  timestamp: params.timestamp,
  payload: {
    code: params.code,
    message: params.message,
    retryable: params.retryable,
    fatal: params.fatal,
  } satisfies SessionErrorPayload,
});

export const serializeServerEvent = (event: ServerEventEnvelope): string => JSON.stringify(event);
