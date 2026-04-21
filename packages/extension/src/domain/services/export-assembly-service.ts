import { err, ok, type Result } from 'neverthrow';
import { type ExportFormat } from '../export/export-record.js';
import { type TranscriptSegment } from '../transcript/transcript-segment.js';
import { type TranscriptStream } from '../transcript/transcript-stream.js';
import { type TranslationSegment } from '../transcript/translation-segment.js';
import { type DomainError, validationError } from '../shared/errors.js';

/**
 * エクスポート整形サービス (DD-242)。
 *
 * `TranscriptStream` と出力オプションを受け、TXT / JSON 文字列を返す。
 * 確定字幕 (`TranscriptSegment.isFinal === true`) のみを対象とし、`startMs`
 * 昇順にソートする。failed の翻訳は本文を持たないため翻訳出力から除外する。
 */
export type ExportAssemblyOptions = Readonly<{
  format: ExportFormat;
  includeOriginal: boolean;
  includeTranslation: boolean;
}>;

type CompletedTranslation = Readonly<{ targetLanguage: string; text: string }>;

type Row = Readonly<{
  segment: TranscriptSegment;
  translation: CompletedTranslation | null;
}>;

const formatTimestampPrefix = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const millis = ms % 1000;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
};

const pickCompletedTranslation = (
  translation: TranslationSegment | undefined,
): CompletedTranslation | null => {
  if (translation === undefined) return null;
  if (translation.status !== 'completed') return null;
  return { targetLanguage: translation.targetLanguage, text: translation.text };
};

const collectRows = (stream: TranscriptStream, options: ExportAssemblyOptions): Row[] => {
  const finals: TranscriptSegment[] = [];
  for (const segment of stream.segments.values()) {
    if (segment.isFinal) finals.push(segment);
  }
  finals.sort((a, b) => a.timeRange.startMs - b.timeRange.startMs);
  return finals.map((segment) => ({
    segment,
    translation: options.includeTranslation
      ? pickCompletedTranslation(stream.translations.get(segment.segmentIdentifier))
      : null,
  }));
};

const formatTxt = (rows: readonly Row[], options: ExportAssemblyOptions): string => {
  const lines: string[] = [];
  for (const row of rows) {
    if (options.includeOriginal) {
      lines.push(`[${formatTimestampPrefix(row.segment.timeRange.startMs)}] ${row.segment.text}`);
    }
    if (row.translation !== null) {
      lines.push(`→ [${row.translation.targetLanguage}] ${row.translation.text}`);
    }
  }
  return lines.join('\n');
};

type JsonSegmentEntry = {
  segmentIdentifier: string;
  startMs: number;
  endMs: number;
  text?: string;
  translation?: CompletedTranslation;
};

const formatJson = (
  rows: readonly Row[],
  stream: TranscriptStream,
  options: ExportAssemblyOptions,
): string => {
  const segments: JsonSegmentEntry[] = rows.map((row) => {
    const entry: JsonSegmentEntry = {
      segmentIdentifier: row.segment.segmentIdentifier,
      startMs: row.segment.timeRange.startMs,
      endMs: row.segment.timeRange.endMs,
    };
    if (options.includeOriginal) entry.text = row.segment.text;
    if (row.translation !== null) entry.translation = row.translation;
    return entry;
  });
  return JSON.stringify({ sessionIdentifier: stream.sessionIdentifier, segments });
};

export const assembleExport = (
  stream: TranscriptStream,
  options: ExportAssemblyOptions,
): Result<string, DomainError> => {
  if (!options.includeOriginal && !options.includeTranslation) {
    return err(
      validationError({
        field: 'ExportAssemblyOptions',
        message: 'at least one of includeOriginal / includeTranslation must be true',
      }),
    );
  }
  const rows = collectRows(stream, options);
  if (options.format === 'txt') {
    return ok(formatTxt(rows, options));
  }
  return ok(formatJson(rows, stream, options));
};
