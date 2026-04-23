import { type Result } from 'neverthrow';
import {
  createExportRecord,
  type ExportFormat,
  type ExportRecord,
} from '../../domain/export/export-record';
import {
  createEndpointingPolicy,
  DEFAULT_ENDPOINTING_POLICY,
  type EndpointingPolicy,
} from '../../domain/session/endpointing-policy';
import { createLanguagePair } from '../../domain/session/language-pair';
import { createSourceSession, type SourceSession } from '../../domain/session/source-session';
import { type SessionState } from '../../domain/session/session-state';
import { type SourceType } from '../../domain/session/source-type';
import {
  createTranslationContextWindow,
  DEFAULT_TRANSLATION_CONTEXT_WINDOW,
  type TranslationContextWindow,
} from '../../domain/session/translation-context-window';
import { type DomainError } from '../../domain/shared/errors';
import { createTimestampRange } from '../../domain/transcript/timestamp-range';
import {
  createPartialTranscriptSegment,
  finalizeTranscriptSegment,
  type TranscriptSegment,
} from '../../domain/transcript/transcript-segment';
import {
  createCompletedTranslationSegment,
  createFailedTranslationSegment,
  type TranslationSegment,
} from '../../domain/transcript/translation-segment';

/**
 * 永続モデル (IndexedDB object store の row) ↔ ドメインモデル変換
 * (infrastructure.md §3.3 Data Mapper、DD-1xx)。
 *
 * 永続モデル (Row 型) はプレーンな JSON 互換で、IndexedDB のシリアライゼーション
 * 要件を満たす。ドメインモデル変換は `createXxx` factory を通すことで Zod
 * バリデーションと branded type の復元を保証する。
 */

// ---------- DB-001 sessions ----------

/**
 * `SessionRow` v2: `endpointing*` / `translationContext*` フィールドが
 * null 許容で追加された (IMPL-318)。既存 v1 レコードは null のまま残り、
 * `sessionFromRecord` が読み込み時に VO 既定値を適用する (後方互換)。
 */
export type SessionRow = {
  sessionId: string;
  sourceId: string;
  sourceType: SourceType;
  state: SessionState;
  sourceLanguage: string;
  targetLanguage: string;
  startedAt: string;
  stoppedAt: string | null;
  degradedReason: string | null;
  endpointingSilenceMs: number | null;
  endpointingPunctuationAware: boolean | null;
  endpointingMinUtteranceMs: number | null;
  translationContextMaxSegments: number | null;
  translationContextIncludeTranslatedText: boolean | null;
};

export const sessionToRecord = (session: SourceSession): SessionRow => ({
  sessionId: session.sessionIdentifier,
  sourceId: session.sourceIdentifier,
  sourceType: session.sourceType,
  state: session.state,
  sourceLanguage: session.languagePair.source,
  targetLanguage: session.languagePair.target,
  startedAt: session.startedAt,
  stoppedAt: session.stoppedAt,
  degradedReason: session.degradedReason,
  endpointingSilenceMs: session.endpointing.silenceThresholdMs,
  endpointingPunctuationAware: session.endpointing.punctuationAware,
  endpointingMinUtteranceMs: session.endpointing.minUtteranceMs,
  translationContextMaxSegments: session.translationContext.maxSegments,
  translationContextIncludeTranslatedText: session.translationContext.includeTranslatedText,
});

const endpointingFromRow = (row: SessionRow): EndpointingPolicy => {
  if (
    row.endpointingSilenceMs === null ||
    row.endpointingPunctuationAware === null ||
    row.endpointingMinUtteranceMs === null
  ) {
    return DEFAULT_ENDPOINTING_POLICY;
  }
  const result = createEndpointingPolicy({
    silenceThresholdMs: row.endpointingSilenceMs,
    punctuationAware: row.endpointingPunctuationAware,
    minUtteranceMs: row.endpointingMinUtteranceMs,
  });
  return result.isOk() ? result.value : DEFAULT_ENDPOINTING_POLICY;
};

const translationContextFromRow = (row: SessionRow): TranslationContextWindow => {
  if (
    row.translationContextMaxSegments === null ||
    row.translationContextIncludeTranslatedText === null
  ) {
    return DEFAULT_TRANSLATION_CONTEXT_WINDOW;
  }
  const result = createTranslationContextWindow({
    maxSegments: row.translationContextMaxSegments,
    includeTranslatedText: row.translationContextIncludeTranslatedText,
  });
  return result.isOk() ? result.value : DEFAULT_TRANSLATION_CONTEXT_WINDOW;
};

export const sessionFromRecord = (row: SessionRow): Result<SourceSession, DomainError> =>
  createLanguagePair({ source: row.sourceLanguage, target: row.targetLanguage }).andThen(
    (languagePair) =>
      createSourceSession({
        sessionIdentifier: row.sessionId,
        sourceIdentifier: row.sourceId,
        sourceType: row.sourceType,
        languagePair,
        startedAt: row.startedAt,
        endpointing: endpointingFromRow(row),
        translationContext: translationContextFromRow(row),
      }).map((session) => ({
        ...session,
        state: row.state,
        stoppedAt: row.stoppedAt,
        degradedReason: row.degradedReason,
      })),
  );

// ---------- DB-002 transcript_segments ----------

export type TranscriptSegmentRow = {
  segmentId: string;
  sessionId: string;
  revision: number;
  isFinal: boolean;
  startMs: number;
  endMs: number;
  text: string;
};

export const transcriptSegmentToRecord = (
  sessionIdentifier: string,
  segment: TranscriptSegment,
): TranscriptSegmentRow => ({
  segmentId: segment.segmentIdentifier,
  sessionId: sessionIdentifier,
  revision: segment.revision,
  isFinal: segment.isFinal,
  startMs: segment.timeRange.startMs,
  endMs: segment.timeRange.endMs,
  text: segment.text,
});

export const transcriptSegmentFromRecord = (
  row: TranscriptSegmentRow,
): Result<TranscriptSegment, DomainError> =>
  createTimestampRange({ startMs: row.startMs, endMs: row.endMs }).andThen((timeRange) => {
    const partial = createPartialTranscriptSegment({
      segmentIdentifier: row.segmentId,
      revision: row.revision,
      text: row.text,
      timeRange,
    });
    if (!row.isFinal) return partial;
    return partial.andThen((p) => finalizeTranscriptSegment(p, {}));
  });

// ---------- DB-003 translation_segments ----------

export type TranslationSegmentRow = {
  translationId: string;
  sessionId: string;
  segmentId: string;
  targetLanguage: string;
  status: string;
  text: string;
};

export const translationSegmentToRecord = (
  sessionIdentifier: string,
  translation: TranslationSegment,
): TranslationSegmentRow => ({
  translationId: translation.translationIdentifier,
  sessionId: sessionIdentifier,
  segmentId: translation.segmentIdentifier,
  targetLanguage: translation.targetLanguage,
  status: translation.status,
  text: translation.status === 'completed' ? translation.text : '',
});

export const translationSegmentFromRecord = (
  row: TranslationSegmentRow,
): Result<TranslationSegment, DomainError> => {
  if (row.status === 'completed') {
    return createCompletedTranslationSegment({
      translationIdentifier: row.translationId,
      segmentIdentifier: row.segmentId,
      targetLanguage: row.targetLanguage,
      text: row.text,
    });
  }
  if (row.status === 'failed') {
    return createFailedTranslationSegment({
      translationIdentifier: row.translationId,
      segmentIdentifier: row.segmentId,
      targetLanguage: row.targetLanguage,
    });
  }
  // Unknown status → route through the completed factory which will reject
  // via validation (status must be 'completed' or 'failed').
  return createCompletedTranslationSegment({
    translationIdentifier: row.translationId,
    segmentIdentifier: row.segmentId,
    targetLanguage: row.targetLanguage,
    text: row.text,
  }).andThen(() =>
    createFailedTranslationSegment({
      translationIdentifier: 'invalid',
      segmentIdentifier: row.segmentId,
      targetLanguage: row.targetLanguage,
    }),
  );
};

// ---------- DB-004 export_records ----------

export type ExportRecordRow = {
  exportId: string;
  sessionId: string;
  format: ExportFormat;
  includeOriginal: boolean;
  includeTranslation: boolean;
  createdAt: string;
};

export const exportRecordToRecord = (record: ExportRecord): ExportRecordRow => ({
  exportId: record.exportIdentifier,
  sessionId: record.sessionIdentifier,
  format: record.format,
  includeOriginal: record.includeOriginal,
  includeTranslation: record.includeTranslation,
  createdAt: record.createdAt,
});

export const exportRecordFromRecord = (row: ExportRecordRow): Result<ExportRecord, DomainError> =>
  createExportRecord({
    exportIdentifier: row.exportId,
    sessionIdentifier: row.sessionId,
    format: row.format,
    includeOriginal: row.includeOriginal,
    includeTranslation: row.includeTranslation,
    createdAt: row.createdAt,
  });
