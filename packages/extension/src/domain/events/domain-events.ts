import { type SessionIdentifier } from '../session/session-identifier.js';
import { type SourceIdentifier } from '../session/source-identifier.js';
import { type SourceSession } from '../session/source-session.js';
import { type SourceType } from '../session/source-type.js';
import { type SegmentIdentifier } from '../transcript/segment-identifier.js';
import { type TranscriptSegment } from '../transcript/transcript-segment.js';
import { type TranslationIdentifier } from '../transcript/translation-identifier.js';
import { type TranslationSegment } from '../transcript/translation-segment.js';

/**
 * ドメインイベント (DD-250〜DD-255)。
 *
 * 集約のメソッド呼び出し後にユースケース層が発行する immutable record。
 * 表示層 / 保存層 / 運用ログが購読する。詳細は domain.md §8。
 *
 * factory は純粋関数として実装する。不変条件 (TranscriptFinalized は確定済
 * segment を受ける、TranslationCompleted は completed 翻訳を受ける等) は
 * 既に集約・エンティティ側で保証されているため、factory では再検証しない。
 * 型レベルで narrow できるものは discriminated union の `Extract` で制約する。
 */

type CompletedTranslationSegment = Extract<TranslationSegment, { status: 'completed' }>;

// DD-250
export type SourceSessionStarted = Readonly<{
  type: 'source-session-started';
  sessionIdentifier: SessionIdentifier;
  sourceIdentifier: SourceIdentifier;
  sourceType: SourceType;
  startedAt: string;
}>;

export const sourceSessionStarted = (session: SourceSession): SourceSessionStarted => ({
  type: 'source-session-started',
  sessionIdentifier: session.sessionIdentifier,
  sourceIdentifier: session.sourceIdentifier,
  sourceType: session.sourceType,
  startedAt: session.startedAt,
});

// DD-251
export type TranscriptPartialUpdated = Readonly<{
  type: 'transcript-partial-updated';
  sessionIdentifier: SessionIdentifier;
  segmentIdentifier: SegmentIdentifier;
  revision: number;
  text: string;
}>;

export const transcriptPartialUpdated = (params: {
  sessionIdentifier: SessionIdentifier;
  segment: TranscriptSegment;
}): TranscriptPartialUpdated => ({
  type: 'transcript-partial-updated',
  sessionIdentifier: params.sessionIdentifier,
  segmentIdentifier: params.segment.segmentIdentifier,
  revision: params.segment.revision,
  text: params.segment.text,
});

// DD-252
export type TranscriptFinalized = Readonly<{
  type: 'transcript-finalized';
  sessionIdentifier: SessionIdentifier;
  segmentIdentifier: SegmentIdentifier;
  text: string;
  finalizedAt: string;
}>;

export const transcriptFinalized = (params: {
  sessionIdentifier: SessionIdentifier;
  segment: TranscriptSegment;
  finalizedAt: string;
}): TranscriptFinalized => ({
  type: 'transcript-finalized',
  sessionIdentifier: params.sessionIdentifier,
  segmentIdentifier: params.segment.segmentIdentifier,
  text: params.segment.text,
  finalizedAt: params.finalizedAt,
});

// DD-253
export type TranslationCompleted = Readonly<{
  type: 'translation-completed';
  sessionIdentifier: SessionIdentifier;
  segmentIdentifier: SegmentIdentifier;
  translationIdentifier: TranslationIdentifier;
  text: string;
}>;

export const translationCompleted = (params: {
  sessionIdentifier: SessionIdentifier;
  translation: CompletedTranslationSegment;
}): TranslationCompleted => ({
  type: 'translation-completed',
  sessionIdentifier: params.sessionIdentifier,
  segmentIdentifier: params.translation.segmentIdentifier,
  translationIdentifier: params.translation.translationIdentifier,
  text: params.translation.text,
});

// DD-254
export type SourceSessionDegraded = Readonly<{
  type: 'source-session-degraded';
  sessionIdentifier: SessionIdentifier;
  reason: string;
  occurredAt: string;
}>;

export const sourceSessionDegraded = (params: {
  sessionIdentifier: SessionIdentifier;
  reason: string;
  occurredAt: string;
}): SourceSessionDegraded => ({
  type: 'source-session-degraded',
  sessionIdentifier: params.sessionIdentifier,
  reason: params.reason,
  occurredAt: params.occurredAt,
});

// DD-255
export type SourceSessionStopped = Readonly<{
  type: 'source-session-stopped';
  sessionIdentifier: SessionIdentifier;
  stoppedAt: string;
  reason: string | null;
}>;

export const sourceSessionStopped = (params: {
  sessionIdentifier: SessionIdentifier;
  stoppedAt: string;
  reason: string | null;
}): SourceSessionStopped => ({
  type: 'source-session-stopped',
  sessionIdentifier: params.sessionIdentifier,
  stoppedAt: params.stoppedAt,
  reason: params.reason,
});

export type DomainEvent =
  | SourceSessionStarted
  | TranscriptPartialUpdated
  | TranscriptFinalized
  | TranslationCompleted
  | SourceSessionDegraded
  | SourceSessionStopped;
