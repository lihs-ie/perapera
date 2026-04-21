import { err, ok, type Result } from 'neverthrow';
import { type SessionIdentifier } from '../../domain/session/session-identifier';
import { type DomainError } from '../../domain/shared/errors';
import { type TranscriptSegment } from '../../domain/transcript/transcript-segment';
import { type TranscriptStream } from '../../domain/transcript/transcript-stream';
import { type TranslationSegment } from '../../domain/transcript/translation-segment';
import {
  transcriptSegmentFromRecord,
  translationSegmentFromRecord,
  type TranscriptSegmentRow,
  type TranslationSegmentRow,
} from './records';

/**
 * 行ロー (`TranscriptSegmentRow` / `TranslationSegmentRow`) の並びから
 * `TranscriptStream` 集約を組み立てる共有ユーティリティ。
 *
 * `IndexedDbSessionStore.loadExportBundle` と `IndexedDbTranscriptStreamRepository.findBySessionId`
 * の双方で同一ロジックが必要だったため module に切り出した (設計書 DD-106 と
 * DD-261 の結合点)。
 */
export const assembleTranscriptStream = (
  sessionIdentifier: SessionIdentifier,
  transcripts: readonly TranscriptSegmentRow[],
  translations: readonly TranslationSegmentRow[],
): Result<TranscriptStream, DomainError> => {
  const segments = new Map<string, TranscriptSegment>();
  for (const row of transcripts) {
    const result = transcriptSegmentFromRecord(row);
    if (result.isErr()) return err(result.error);
    segments.set(result.value.segmentIdentifier, result.value);
  }
  const translationMap = new Map<string, TranslationSegment>();
  for (const row of translations) {
    const result = translationSegmentFromRecord(row);
    if (result.isErr()) return err(result.error);
    translationMap.set(result.value.segmentIdentifier, result.value);
  }
  const stream: TranscriptStream = {
    sessionIdentifier,
    segments,
    translations: translationMap,
  };
  return ok(stream);
};
