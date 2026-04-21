import { describe, expect, it } from 'vitest';
import {
  appendPartialTranscriptSegment,
  attachTranslationToSegment,
  createTranscriptStream,
  finalizeSegment,
  type TranscriptStream,
} from '../transcript/transcript-stream';
import {
  createFailedTranslationSegment,
  type TranslationSegment,
} from '../transcript/translation-segment';
import { createTimestampRange, type TimestampRange } from '../transcript/timestamp-range';
import { assembleExport } from './export-assembly-service';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7C1';
const SEGMENT_IDS = [
  '01HZX8Y1R8M7D3Q2P4T5V6W7D1',
  '01HZX8Y1R8M7D3Q2P4T5V6W7D2',
  '01HZX8Y1R8M7D3Q2P4T5V6W7D3',
  '01HZX8Y1R8M7D3Q2P4T5V6W7D4',
] as const;
const TRANSLATION_IDS = [
  '01HZX8Y1R8M7D3Q2P4T5V6W7E1',
  '01HZX8Y1R8M7D3Q2P4T5V6W7E2',
  '01HZX8Y1R8M7D3Q2P4T5V6W7E3',
] as const;

const range = (startMs: number, endMs: number): TimestampRange =>
  createTimestampRange({ startMs, endMs })._unsafeUnwrap();

const emptyStream = (): TranscriptStream =>
  createTranscriptStream({ sessionIdentifier: SESSION_ID })._unsafeUnwrap();

type SegmentSpec = {
  segmentIdentifier: string;
  startMs: number;
  endMs: number;
  text: string;
  isFinal?: boolean;
  translation?: { translationIdentifier: string; targetLanguage: string; text: string } | 'failed';
};

const buildStream = (specs: readonly SegmentSpec[]): TranscriptStream => {
  let stream = emptyStream();
  for (const spec of specs) {
    const isFinal = spec.isFinal ?? true;
    stream = appendPartialTranscriptSegment(stream, {
      segmentIdentifier: spec.segmentIdentifier,
      revision: 1,
      text: spec.text,
      timeRange: range(spec.startMs, spec.endMs),
    })._unsafeUnwrap();
    if (isFinal) {
      stream = finalizeSegment(stream, {
        segmentIdentifier: spec.segmentIdentifier,
      })._unsafeUnwrap();
      if (spec.translation !== undefined) {
        if (spec.translation === 'failed') {
          const failed: TranslationSegment = createFailedTranslationSegment({
            translationIdentifier: TRANSLATION_IDS[0],
            segmentIdentifier: spec.segmentIdentifier,
            targetLanguage: 'ja-JP',
          })._unsafeUnwrap();
          const merged = new Map(stream.translations);
          merged.set(failed.segmentIdentifier, failed);
          stream = { ...stream, translations: merged };
        } else {
          stream = attachTranslationToSegment(stream, {
            translationIdentifier: spec.translation.translationIdentifier,
            segmentIdentifier: spec.segmentIdentifier,
            targetLanguage: spec.translation.targetLanguage,
            text: spec.translation.text,
          })._unsafeUnwrap();
        }
      }
    }
  }
  return stream;
};

describe('ExportAssemblyService (DD-242)', () => {
  describe('guard clauses', () => {
    it('returns validation error when both includeOriginal and includeTranslation are false', () => {
      const result = assembleExport(emptyStream(), {
        format: 'txt',
        includeOriginal: false,
        includeTranslation: false,
      });
      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.kind).toBe('validation');
    });
  });

  describe('TXT format', () => {
    it('returns empty string for an empty stream', () => {
      const result = assembleExport(emptyStream(), {
        format: 'txt',
        includeOriginal: true,
        includeTranslation: true,
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value).toBe('');
    });

    it('formats a single final segment with original only', () => {
      const stream = buildStream([
        { segmentIdentifier: SEGMENT_IDS[0], startMs: 0, endMs: 1500, text: 'hello' },
      ]);
      const result = assembleExport(stream, {
        format: 'txt',
        includeOriginal: true,
        includeTranslation: false,
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value).toBe('[00:00.000] hello');
    });

    it('formats original + completed translation in two lines', () => {
      const stream = buildStream([
        {
          segmentIdentifier: SEGMENT_IDS[0],
          startMs: 0,
          endMs: 1500,
          text: 'hello',
          translation: {
            translationIdentifier: TRANSLATION_IDS[0],
            targetLanguage: 'ja-JP',
            text: 'こんにちは',
          },
        },
      ]);
      const result = assembleExport(stream, {
        format: 'txt',
        includeOriginal: true,
        includeTranslation: true,
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe('[00:00.000] hello\n→ [ja-JP] こんにちは');
      }
    });

    it('formats translation only when includeOriginal is false', () => {
      const stream = buildStream([
        {
          segmentIdentifier: SEGMENT_IDS[0],
          startMs: 500,
          endMs: 2000,
          text: 'hello',
          translation: {
            translationIdentifier: TRANSLATION_IDS[0],
            targetLanguage: 'ja-JP',
            text: 'こんにちは',
          },
        },
      ]);
      const result = assembleExport(stream, {
        format: 'txt',
        includeOriginal: false,
        includeTranslation: true,
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value).toBe('→ [ja-JP] こんにちは');
    });

    it('sorts segments by startMs ascending', () => {
      const stream = buildStream([
        { segmentIdentifier: SEGMENT_IDS[0], startMs: 5000, endMs: 6000, text: 'third' },
        { segmentIdentifier: SEGMENT_IDS[1], startMs: 500, endMs: 1500, text: 'second' },
        { segmentIdentifier: SEGMENT_IDS[2], startMs: 0, endMs: 400, text: 'first' },
      ]);
      const result = assembleExport(stream, {
        format: 'txt',
        includeOriginal: true,
        includeTranslation: false,
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe('[00:00.000] first\n[00:00.500] second\n[00:05.000] third');
      }
    });

    it('excludes non-finalized (partial) segments', () => {
      const stream = buildStream([
        { segmentIdentifier: SEGMENT_IDS[0], startMs: 0, endMs: 1000, text: 'final one' },
        {
          segmentIdentifier: SEGMENT_IDS[1],
          startMs: 1200,
          endMs: 2000,
          text: 'partial one',
          isFinal: false,
        },
      ]);
      const result = assembleExport(stream, {
        format: 'txt',
        includeOriginal: true,
        includeTranslation: false,
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value).toBe('[00:00.000] final one');
    });

    it('excludes failed translations but keeps the original line', () => {
      const stream = buildStream([
        {
          segmentIdentifier: SEGMENT_IDS[0],
          startMs: 0,
          endMs: 1000,
          text: 'hello',
          translation: 'failed',
        },
      ]);
      const result = assembleExport(stream, {
        format: 'txt',
        includeOriginal: true,
        includeTranslation: true,
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value).toBe('[00:00.000] hello');
    });

    it('skips segments with only failed translation when includeOriginal is false', () => {
      const stream = buildStream([
        {
          segmentIdentifier: SEGMENT_IDS[0],
          startMs: 0,
          endMs: 1000,
          text: 'hello',
          translation: 'failed',
        },
        {
          segmentIdentifier: SEGMENT_IDS[1],
          startMs: 2000,
          endMs: 3000,
          text: 'world',
          translation: {
            translationIdentifier: TRANSLATION_IDS[0],
            targetLanguage: 'ja-JP',
            text: 'せかい',
          },
        },
      ]);
      const result = assembleExport(stream, {
        format: 'txt',
        includeOriginal: false,
        includeTranslation: true,
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value).toBe('→ [ja-JP] せかい');
    });

    it.each([
      [0, '00:00.000'],
      [59999, '00:59.999'],
      [60000, '01:00.000'],
      [3600000, '60:00.000'],
    ])('formats timestamp prefix for startMs=%i as [%s]', (startMs, formatted) => {
      const stream = buildStream([
        { segmentIdentifier: SEGMENT_IDS[0], startMs, endMs: startMs + 1000, text: 't' },
      ]);
      const result = assembleExport(stream, {
        format: 'txt',
        includeOriginal: true,
        includeTranslation: false,
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value).toBe(`[${formatted}] t`);
    });
  });

  describe('JSON format', () => {
    it('returns a well-formed JSON with empty segments for an empty stream', () => {
      const result = assembleExport(emptyStream(), {
        format: 'json',
        includeOriginal: true,
        includeTranslation: true,
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(`{"sessionIdentifier":"${SESSION_ID}","segments":[]}`);
      }
    });

    it('includes text and translation fields when both flags are true', () => {
      const stream = buildStream([
        {
          segmentIdentifier: SEGMENT_IDS[0],
          startMs: 0,
          endMs: 1500,
          text: 'hello',
          translation: {
            translationIdentifier: TRANSLATION_IDS[0],
            targetLanguage: 'ja-JP',
            text: 'こんにちは',
          },
        },
      ]);
      const result = assembleExport(stream, {
        format: 'json',
        includeOriginal: true,
        includeTranslation: true,
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const expected = `{"sessionIdentifier":"${SESSION_ID}","segments":[{"segmentIdentifier":"${SEGMENT_IDS[0]}","startMs":0,"endMs":1500,"text":"hello","translation":{"targetLanguage":"ja-JP","text":"こんにちは"}}]}`;
        expect(result.value).toBe(expected);
      }
    });

    it('omits text field when includeOriginal is false', () => {
      const stream = buildStream([
        {
          segmentIdentifier: SEGMENT_IDS[0],
          startMs: 0,
          endMs: 1500,
          text: 'hello',
          translation: {
            translationIdentifier: TRANSLATION_IDS[0],
            targetLanguage: 'ja-JP',
            text: 'こんにちは',
          },
        },
      ]);
      const result = assembleExport(stream, {
        format: 'json',
        includeOriginal: false,
        includeTranslation: true,
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).not.toMatch(/"text":"hello"/);
        expect(result.value).toMatch(
          /"translation":\{"targetLanguage":"ja-JP","text":"こんにちは"\}/,
        );
      }
    });

    it('omits translation field when includeTranslation is false', () => {
      const stream = buildStream([
        {
          segmentIdentifier: SEGMENT_IDS[0],
          startMs: 0,
          endMs: 1500,
          text: 'hello',
          translation: {
            translationIdentifier: TRANSLATION_IDS[0],
            targetLanguage: 'ja-JP',
            text: 'こんにちは',
          },
        },
      ]);
      const result = assembleExport(stream, {
        format: 'json',
        includeOriginal: true,
        includeTranslation: false,
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).not.toMatch(/"translation"/);
        expect(result.value).toMatch(/"text":"hello"/);
      }
    });

    it('omits translation field when translation status is failed', () => {
      const stream = buildStream([
        {
          segmentIdentifier: SEGMENT_IDS[0],
          startMs: 0,
          endMs: 1500,
          text: 'hello',
          translation: 'failed',
        },
      ]);
      const result = assembleExport(stream, {
        format: 'json',
        includeOriginal: true,
        includeTranslation: true,
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).not.toMatch(/"translation"/);
      }
    });

    it('sorts segments by startMs ascending in JSON output', () => {
      const stream = buildStream([
        { segmentIdentifier: SEGMENT_IDS[0], startMs: 5000, endMs: 6000, text: 'c' },
        { segmentIdentifier: SEGMENT_IDS[1], startMs: 500, endMs: 1500, text: 'b' },
        { segmentIdentifier: SEGMENT_IDS[2], startMs: 0, endMs: 400, text: 'a' },
      ]);
      const result = assembleExport(stream, {
        format: 'json',
        includeOriginal: true,
        includeTranslation: false,
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const idxA = result.value.indexOf('"text":"a"');
        const idxB = result.value.indexOf('"text":"b"');
        const idxC = result.value.indexOf('"text":"c"');
        expect(idxA).toBeGreaterThan(-1);
        expect(idxA).toBeLessThan(idxB);
        expect(idxB).toBeLessThan(idxC);
      }
    });

    it('excludes partial (non-finalized) segments from JSON output', () => {
      const stream = buildStream([
        { segmentIdentifier: SEGMENT_IDS[0], startMs: 0, endMs: 1000, text: 'final' },
        {
          segmentIdentifier: SEGMENT_IDS[1],
          startMs: 1200,
          endMs: 2000,
          text: 'partial',
          isFinal: false,
        },
      ]);
      const result = assembleExport(stream, {
        format: 'json',
        includeOriginal: true,
        includeTranslation: false,
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toMatch(/"text":"final"/);
        expect(result.value).not.toMatch(/"text":"partial"/);
      }
    });
  });
});
