import { describe, expect, it } from 'vitest';
import {
  appendPartialTranscriptSegment,
  attachTranslationToSegment,
  createTranscriptStream,
  finalizeSegment,
  getSegment,
  getTranslation,
  recentFinalTail,
} from './transcript-stream';
import { createTimestampRange } from './timestamp-range';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7X8';
const SEGMENT_A = '01HZX8Y2R8M7D3Q2P4T5V6W7X1';
const SEGMENT_B = '01HZX8Y2R8M7D3Q2P4T5V6W7X2';
const TRANSLATION_A = '01HZX8Y3R8M7D3Q2P4T5V6W7X1';

const timeRange = createTimestampRange({ startMs: 0, endMs: 500 })._unsafeUnwrap();

const newStream = () => createTranscriptStream({ sessionIdentifier: SESSION_ID })._unsafeUnwrap();

describe('TranscriptStream aggregate', () => {
  describe('createTranscriptStream', () => {
    it('creates an empty stream bound to a session', () => {
      const result = createTranscriptStream({ sessionIdentifier: SESSION_ID });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.sessionIdentifier).toBe(SESSION_ID);
      }
    });

    it('rejects invalid sessionIdentifier', () => {
      expect(createTranscriptStream({ sessionIdentifier: 'bad' }).isErr()).toBe(true);
    });
  });

  describe('appendPartialTranscriptSegment', () => {
    it('adds a new partial segment', () => {
      const result = appendPartialTranscriptSegment(newStream(), {
        segmentIdentifier: SEGMENT_A,
        revision: 1,
        text: 'he',
        timeRange,
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(getSegment(result.value, SEGMENT_A)).toBeDefined();
      }
    });

    it('updates an existing partial segment with a higher revision', () => {
      let stream = newStream();
      stream = appendPartialTranscriptSegment(stream, {
        segmentIdentifier: SEGMENT_A,
        revision: 1,
        text: 'he',
        timeRange,
      })._unsafeUnwrap();
      const result = appendPartialTranscriptSegment(stream, {
        segmentIdentifier: SEGMENT_A,
        revision: 2,
        text: 'hello',
        timeRange,
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const seg = getSegment(result.value, SEGMENT_A);
        expect(seg?.revision).toBe(2);
        expect(seg?.text).toBe('hello');
      }
    });

    it('rejects update with same or smaller revision', () => {
      let stream = newStream();
      stream = appendPartialTranscriptSegment(stream, {
        segmentIdentifier: SEGMENT_A,
        revision: 3,
        text: 'hello',
        timeRange,
      })._unsafeUnwrap();
      expect(
        appendPartialTranscriptSegment(stream, {
          segmentIdentifier: SEGMENT_A,
          revision: 3,
          text: 'x',
          timeRange,
        }).isErr(),
      ).toBe(true);
    });

    it('rejects partial append on already-finalized segment', () => {
      let stream = newStream();
      stream = appendPartialTranscriptSegment(stream, {
        segmentIdentifier: SEGMENT_A,
        revision: 1,
        text: 'hello',
        timeRange,
      })._unsafeUnwrap();
      stream = finalizeSegment(stream, { segmentIdentifier: SEGMENT_A })._unsafeUnwrap();
      const result = appendPartialTranscriptSegment(stream, {
        segmentIdentifier: SEGMENT_A,
        revision: 2,
        text: 'hello',
        timeRange,
      });
      expect(result.isErr()).toBe(true);
    });
  });

  describe('finalizeSegment', () => {
    it('finalizes an existing partial segment', () => {
      let stream = newStream();
      stream = appendPartialTranscriptSegment(stream, {
        segmentIdentifier: SEGMENT_A,
        revision: 2,
        text: 'hello',
        timeRange,
      })._unsafeUnwrap();
      const result = finalizeSegment(stream, { segmentIdentifier: SEGMENT_A });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(getSegment(result.value, SEGMENT_A)?.isFinal).toBe(true);
      }
    });

    it('allows overriding text/timeRange at finalize', () => {
      let stream = newStream();
      stream = appendPartialTranscriptSegment(stream, {
        segmentIdentifier: SEGMENT_A,
        revision: 1,
        text: 'he',
        timeRange,
      })._unsafeUnwrap();
      const result = finalizeSegment(stream, {
        segmentIdentifier: SEGMENT_A,
        text: 'hello world',
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(getSegment(result.value, SEGMENT_A)?.text).toBe('hello world');
      }
    });

    it('creates the segment directly when finalize is called without prior partial', () => {
      const result = finalizeSegment(newStream(), {
        segmentIdentifier: SEGMENT_B,
        text: 'direct final',
        timeRange,
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(getSegment(result.value, SEGMENT_B)?.isFinal).toBe(true);
      }
    });

    it('rejects finalize for an already-final segment (DD-211 invariant)', () => {
      let stream = newStream();
      stream = appendPartialTranscriptSegment(stream, {
        segmentIdentifier: SEGMENT_A,
        revision: 1,
        text: 'hello',
        timeRange,
      })._unsafeUnwrap();
      stream = finalizeSegment(stream, { segmentIdentifier: SEGMENT_A })._unsafeUnwrap();
      const result = finalizeSegment(stream, { segmentIdentifier: SEGMENT_A });
      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.kind).toBe('invariant-violation');
    });

    it('rejects finalize without text when no partial exists', () => {
      const result = finalizeSegment(newStream(), { segmentIdentifier: SEGMENT_B });
      expect(result.isErr()).toBe(true);
    });
  });

  describe('attachTranslationToSegment', () => {
    it('attaches a translation to a finalized segment', () => {
      let stream = newStream();
      stream = appendPartialTranscriptSegment(stream, {
        segmentIdentifier: SEGMENT_A,
        revision: 1,
        text: 'hello',
        timeRange,
      })._unsafeUnwrap();
      stream = finalizeSegment(stream, { segmentIdentifier: SEGMENT_A })._unsafeUnwrap();
      const result = attachTranslationToSegment(stream, {
        translationIdentifier: TRANSLATION_A,
        segmentIdentifier: SEGMENT_A,
        targetLanguage: 'ja-JP',
        text: 'こんにちは',
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const translation = getTranslation(result.value, SEGMENT_A);
        expect(translation?.status).toBe('completed');
      }
    });

    it('rejects attachment to a non-final segment (DD-211 / DD-271)', () => {
      let stream = newStream();
      stream = appendPartialTranscriptSegment(stream, {
        segmentIdentifier: SEGMENT_A,
        revision: 1,
        text: 'hello',
        timeRange,
      })._unsafeUnwrap();
      const result = attachTranslationToSegment(stream, {
        translationIdentifier: TRANSLATION_A,
        segmentIdentifier: SEGMENT_A,
        targetLanguage: 'ja-JP',
        text: 'こんにちは',
      });
      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.kind).toBe('invariant-violation');
    });

    it('rejects attachment to a missing segment', () => {
      const result = attachTranslationToSegment(newStream(), {
        translationIdentifier: TRANSLATION_A,
        segmentIdentifier: SEGMENT_A,
        targetLanguage: 'ja-JP',
        text: 'x',
      });
      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.kind).toBe('not-found');
    });

    it('overwrites an existing translation (latest wins)', () => {
      let stream = newStream();
      stream = appendPartialTranscriptSegment(stream, {
        segmentIdentifier: SEGMENT_A,
        revision: 1,
        text: 'hello',
        timeRange,
      })._unsafeUnwrap();
      stream = finalizeSegment(stream, { segmentIdentifier: SEGMENT_A })._unsafeUnwrap();
      stream = attachTranslationToSegment(stream, {
        translationIdentifier: TRANSLATION_A,
        segmentIdentifier: SEGMENT_A,
        targetLanguage: 'ja-JP',
        text: '初回',
      })._unsafeUnwrap();
      const result = attachTranslationToSegment(stream, {
        translationIdentifier: TRANSLATION_A,
        segmentIdentifier: SEGMENT_A,
        targetLanguage: 'ja-JP',
        text: '修正済',
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const translation = getTranslation(result.value, SEGMENT_A);
        expect(translation?.status === 'completed' && translation.text).toBe('修正済');
      }
    });
  });

  describe('recentFinalTail (DD-211 invariant 4)', () => {
    const SEGMENT_IDS = [
      '01HZX8Y2R8M7D3Q2P4T5V6W7X1',
      '01HZX8Y2R8M7D3Q2P4T5V6W7X2',
      '01HZX8Y2R8M7D3Q2P4T5V6W7X3',
      '01HZX8Y2R8M7D3Q2P4T5V6W7X4',
      '01HZX8Y2R8M7D3Q2P4T5V6W7X5',
    ];

    const streamWithFinals = (count: number) => {
      let stream = newStream();
      for (let i = 0; i < count; i += 1) {
        stream = finalizeSegment(stream, {
          segmentIdentifier: SEGMENT_IDS[i]!,
          text: `final ${i + 1}`,
          timeRange: createTimestampRange({
            startMs: i * 1000,
            endMs: i * 1000 + 500,
          })._unsafeUnwrap(),
        })._unsafeUnwrap();
      }
      return stream;
    };

    it('returns an empty array when maxSegments=0', () => {
      const stream = streamWithFinals(3);
      expect(recentFinalTail(stream, 0)).toEqual([]);
    });

    it('returns all finals when stream has fewer than maxSegments', () => {
      const stream = streamWithFinals(2);
      const tail = recentFinalTail(stream, 5);
      expect(tail.length).toBe(2);
      expect(tail.map((segment) => segment.text)).toEqual(['final 1', 'final 2']);
    });

    it('returns the last maxSegments finals in insertion order', () => {
      const stream = streamWithFinals(5);
      const tail = recentFinalTail(stream, 3);
      expect(tail.length).toBe(3);
      expect(tail.map((segment) => segment.text)).toEqual(['final 3', 'final 4', 'final 5']);
    });

    it('excludes non-final (partial) segments', () => {
      let stream = newStream();
      stream = finalizeSegment(stream, {
        segmentIdentifier: SEGMENT_IDS[0]!,
        text: 'one',
        timeRange,
      })._unsafeUnwrap();
      stream = appendPartialTranscriptSegment(stream, {
        segmentIdentifier: SEGMENT_IDS[1]!,
        revision: 1,
        text: 'partial-only',
        timeRange,
      })._unsafeUnwrap();
      const tail = recentFinalTail(stream, 5);
      expect(tail.length).toBe(1);
      expect(tail[0]!.text).toBe('one');
    });

    it('treats negative maxSegments as empty', () => {
      const stream = streamWithFinals(3);
      expect(recentFinalTail(stream, -1)).toEqual([]);
    });
  });
});
