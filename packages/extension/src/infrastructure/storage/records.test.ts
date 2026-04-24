import { describe, expect, it } from 'vitest';
import { createExportRecord } from '../../domain/export/export-record';
import { createLanguagePair } from '../../domain/session/language-pair';
import { createSourceSession } from '../../domain/session/source-session';
import { createTimestampRange } from '../../domain/transcript/timestamp-range';
import {
  createPartialTranscriptSegment,
  finalizeTranscriptSegment,
} from '../../domain/transcript/transcript-segment';
import {
  createCompletedTranslationSegment,
  createFailedTranslationSegment,
} from '../../domain/transcript/translation-segment';
import {
  exportRecordToRecord,
  sessionFromRecord,
  sessionToRecord,
  transcriptSegmentFromRecord,
  transcriptSegmentToRecord,
  translationSegmentFromRecord,
  translationSegmentToRecord,
  type ExportRecordRow,
  type SessionRow,
  type TranscriptSegmentRow,
  type TranslationSegmentRow,
} from './records';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const SOURCE_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7B1';
const SEGMENT_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7D1';
const TRANSLATION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7E1';
const EXPORT_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7F1';
const STARTED_AT = '2026-04-21T00:00:00.000Z';
const STOPPED_AT = '2026-04-21T00:10:00.000Z';

const buildSession = () =>
  createSourceSession({
    sessionIdentifier: SESSION_ID,
    sourceIdentifier: SOURCE_ID,
    sourceType: 'tab',
    languagePair: createLanguagePair({ source: 'en-US', target: 'ja-JP' })._unsafeUnwrap(),
    startedAt: STARTED_AT,
  })._unsafeUnwrap();

describe('SessionRow mapper (DD-106, DB-001)', () => {
  it('round-trips a domain SourceSession through to/from record', () => {
    const session = buildSession();
    const row = sessionToRecord(session);
    expect(row.sessionId).toBe(SESSION_ID);
    expect(row.sourceId).toBe(SOURCE_ID);
    expect(row.sourceType).toBe('tab');
    expect(row.sourceLanguage).toBe('en-US');
    expect(row.targetLanguage).toBe('ja-JP');
    expect(row.state).toBe('idle');
    expect(row.startedAt).toBe(STARTED_AT);
    expect(row.stoppedAt).toBeNull();
    expect(row.degradedReason).toBeNull();

    const restored = sessionFromRecord(row);
    expect(restored.isOk()).toBe(true);
    if (restored.isOk()) {
      expect(restored.value.sessionIdentifier).toBe(SESSION_ID);
      expect(restored.value.sourceIdentifier).toBe(SOURCE_ID);
      expect(restored.value.state).toBe('idle');
      expect(restored.value.languagePair.source).toBe('en-US');
    }
  });

  it('preserves stoppedAt and degradedReason', () => {
    const row: SessionRow = {
      sessionId: SESSION_ID,
      sourceId: SOURCE_ID,
      sourceType: 'microphone',
      state: 'stopped',
      sourceLanguage: 'en-US',
      targetLanguage: 'ja-JP',
      startedAt: STARTED_AT,
      stoppedAt: STOPPED_AT,
      degradedReason: 'translation timeout',
      endpointingSilenceMs: null,
      endpointingPunctuationAware: null,
      endpointingMinUtteranceMs: null,
      translationContextMaxSegments: null,
      translationContextIncludeTranslatedText: null,
      glossaryEntries: null,
    };
    const restored = sessionFromRecord(row);
    expect(restored.isOk()).toBe(true);
    if (restored.isOk()) {
      expect(restored.value.stoppedAt).toBe(STOPPED_AT);
      expect(restored.value.degradedReason).toBe('translation timeout');
      expect(restored.value.state).toBe('stopped');
    }
  });

  it('returns validation error for malformed identifiers', () => {
    const row: SessionRow = {
      sessionId: 'not-a-ulid',
      sourceId: SOURCE_ID,
      sourceType: 'tab',
      state: 'idle',
      sourceLanguage: 'en-US',
      targetLanguage: 'ja-JP',
      startedAt: STARTED_AT,
      stoppedAt: null,
      degradedReason: null,
      endpointingSilenceMs: null,
      endpointingPunctuationAware: null,
      endpointingMinUtteranceMs: null,
      translationContextMaxSegments: null,
      translationContextIncludeTranslatedText: null,
      glossaryEntries: null,
    };
    expect(sessionFromRecord(row).isErr()).toBe(true);
  });

  it('returns validation error for malformed language pair (same source/target)', () => {
    const row: SessionRow = {
      sessionId: SESSION_ID,
      sourceId: SOURCE_ID,
      sourceType: 'tab',
      state: 'idle',
      sourceLanguage: 'ja-JP',
      targetLanguage: 'ja-JP',
      startedAt: STARTED_AT,
      stoppedAt: null,
      degradedReason: null,
      endpointingSilenceMs: null,
      endpointingPunctuationAware: null,
      endpointingMinUtteranceMs: null,
      translationContextMaxSegments: null,
      translationContextIncludeTranslatedText: null,
      glossaryEntries: null,
    };
    expect(sessionFromRecord(row).isErr()).toBe(true);
  });
});

describe('TranscriptSegmentRow mapper (DB-002)', () => {
  it('round-trips a partial segment', () => {
    const segment = createPartialTranscriptSegment({
      segmentIdentifier: SEGMENT_ID,
      revision: 2,
      text: 'hello',
      timeRange: createTimestampRange({ startMs: 100, endMs: 500 })._unsafeUnwrap(),
    })._unsafeUnwrap();
    const row = transcriptSegmentToRecord(buildSession().sessionIdentifier, segment);
    expect(row.segmentId).toBe(SEGMENT_ID);
    expect(row.sessionId).toBe(SESSION_ID);
    expect(row.revision).toBe(2);
    expect(row.isFinal).toBe(false);
    expect(row.startMs).toBe(100);
    expect(row.endMs).toBe(500);
    expect(row.text).toBe('hello');

    const restored = transcriptSegmentFromRecord(row);
    expect(restored.isOk()).toBe(true);
    if (restored.isOk()) {
      expect(restored.value.revision).toBe(2);
      expect(restored.value.isFinal).toBe(false);
    }
  });

  it('round-trips a finalized segment', () => {
    const partial = createPartialTranscriptSegment({
      segmentIdentifier: SEGMENT_ID,
      revision: 1,
      text: 'world',
      timeRange: createTimestampRange({ startMs: 0, endMs: 1500 })._unsafeUnwrap(),
    })._unsafeUnwrap();
    const finalized = finalizeTranscriptSegment(partial, {})._unsafeUnwrap();
    const row = transcriptSegmentToRecord(buildSession().sessionIdentifier, finalized);
    expect(row.isFinal).toBe(true);
    const restored = transcriptSegmentFromRecord(row);
    expect(restored.isOk()).toBe(true);
    if (restored.isOk()) expect(restored.value.isFinal).toBe(true);
  });
});

describe('TranslationSegmentRow mapper (DB-003)', () => {
  it('round-trips a completed translation', () => {
    const translation = createCompletedTranslationSegment({
      translationIdentifier: TRANSLATION_ID,
      segmentIdentifier: SEGMENT_ID,
      targetLanguage: 'ja-JP',
      text: 'こんにちは',
    })._unsafeUnwrap();
    const row = translationSegmentToRecord(buildSession().sessionIdentifier, translation);
    expect(row.translationId).toBe(TRANSLATION_ID);
    expect(row.status).toBe('completed');
    expect(row.text).toBe('こんにちは');
    const restored = translationSegmentFromRecord(row);
    expect(restored.isOk()).toBe(true);
    if (restored.isOk() && restored.value.status === 'completed') {
      expect(restored.value.text).toBe('こんにちは');
    }
  });

  it('round-trips a failed translation (empty text)', () => {
    const translation = createFailedTranslationSegment({
      translationIdentifier: TRANSLATION_ID,
      segmentIdentifier: SEGMENT_ID,
      targetLanguage: 'ja-JP',
    })._unsafeUnwrap();
    const row = translationSegmentToRecord(buildSession().sessionIdentifier, translation);
    expect(row.status).toBe('failed');
    expect(row.text).toBe('');
    const restored = translationSegmentFromRecord(row);
    expect(restored.isOk()).toBe(true);
    if (restored.isOk()) expect(restored.value.status).toBe('failed');
  });

  it('rejects rows with invalid status', () => {
    const row: TranslationSegmentRow = {
      translationId: TRANSLATION_ID,
      sessionId: SESSION_ID,
      segmentId: SEGMENT_ID,
      targetLanguage: 'ja-JP',
      status: 'unknown',
      text: '',
    };
    expect(translationSegmentFromRecord(row).isErr()).toBe(true);
  });
});

describe('ExportRecordRow mapper (DB-004)', () => {
  it('serializes an ExportRecord to a row', () => {
    const record = createExportRecord({
      exportIdentifier: EXPORT_ID,
      sessionIdentifier: SESSION_ID,
      format: 'txt',
      includeOriginal: true,
      includeTranslation: false,
      createdAt: STARTED_AT,
    })._unsafeUnwrap();
    const row: ExportRecordRow = exportRecordToRecord(record);
    expect(row.exportId).toBe(EXPORT_ID);
    expect(row.sessionId).toBe(SESSION_ID);
    expect(row.format).toBe('txt');
    expect(row.includeOriginal).toBe(true);
    expect(row.includeTranslation).toBe(false);
    expect(row.createdAt).toBe(STARTED_AT);
  });
});

describe('Type shape checks', () => {
  it('TranscriptSegmentRow and SessionRow are plain data types suitable for IndexedDB', () => {
    const sRow: SessionRow = {
      sessionId: SESSION_ID,
      sourceId: SOURCE_ID,
      sourceType: 'tab',
      state: 'idle',
      sourceLanguage: 'en-US',
      targetLanguage: 'ja-JP',
      startedAt: STARTED_AT,
      stoppedAt: null,
      degradedReason: null,
      endpointingSilenceMs: null,
      endpointingPunctuationAware: null,
      endpointingMinUtteranceMs: null,
      translationContextMaxSegments: null,
      translationContextIncludeTranslatedText: null,
      glossaryEntries: null,
    };
    const tRow: TranscriptSegmentRow = {
      segmentId: SEGMENT_ID,
      sessionId: SESSION_ID,
      revision: 1,
      isFinal: false,
      startMs: 0,
      endMs: 100,
      text: 'x',
    };
    expect(JSON.parse(JSON.stringify(sRow))).toEqual(sRow);
    expect(JSON.parse(JSON.stringify(tRow))).toEqual(tRow);
  });
});
