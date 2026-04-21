import { describe, expect, it } from 'vitest';
import { createTimestampRange } from './timestamp-range.js';
import {
  createPartialTranscriptSegment,
  finalizeTranscriptSegment,
  updatePartialTranscriptSegment,
} from './transcript-segment.js';

const VALID_ULID = '01HZX8Y1R8M7D3Q2P4T5V6W7X8';
const timeRange = createTimestampRange({ startMs: 0, endMs: 1000 })._unsafeUnwrap();

describe('TranscriptSegment', () => {
  describe('createPartialTranscriptSegment', () => {
    it('creates a partial segment with revision=1 and isFinal=false', () => {
      const result = createPartialTranscriptSegment({
        segmentIdentifier: VALID_ULID,
        revision: 1,
        text: 'hello',
        timeRange,
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.revision).toBe(1);
        expect(result.value.isFinal).toBe(false);
        expect(result.value.text).toBe('hello');
      }
    });

    it('rejects revision < 1', () => {
      const result = createPartialTranscriptSegment({
        segmentIdentifier: VALID_ULID,
        revision: 0,
        text: 'hello',
        timeRange,
      });
      expect(result.isErr()).toBe(true);
    });

    it('rejects empty text', () => {
      const result = createPartialTranscriptSegment({
        segmentIdentifier: VALID_ULID,
        revision: 1,
        text: '',
        timeRange,
      });
      expect(result.isErr()).toBe(true);
    });
  });

  describe('updatePartialTranscriptSegment', () => {
    it('increments revision monotonically', () => {
      const current = createPartialTranscriptSegment({
        segmentIdentifier: VALID_ULID,
        revision: 1,
        text: 'he',
        timeRange,
      })._unsafeUnwrap();
      const result = updatePartialTranscriptSegment(current, { revision: 2, text: 'hello' });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value.revision).toBe(2);
    });

    it('rejects same or smaller revision', () => {
      const current = createPartialTranscriptSegment({
        segmentIdentifier: VALID_ULID,
        revision: 3,
        text: 'hello',
        timeRange,
      })._unsafeUnwrap();
      expect(updatePartialTranscriptSegment(current, { revision: 3, text: 'x' }).isErr()).toBe(
        true,
      );
      expect(updatePartialTranscriptSegment(current, { revision: 2, text: 'x' }).isErr()).toBe(
        true,
      );
    });

    it('rejects update on already-final segment', () => {
      const partial = createPartialTranscriptSegment({
        segmentIdentifier: VALID_ULID,
        revision: 1,
        text: 'hello',
        timeRange,
      })._unsafeUnwrap();
      const final = finalizeTranscriptSegment(partial, {})._unsafeUnwrap();
      const result = updatePartialTranscriptSegment(final, { revision: 2, text: 'x' });
      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.kind).toBe('invariant-violation');
    });
  });

  describe('finalizeTranscriptSegment', () => {
    it('marks segment as final (isFinal=true)', () => {
      const partial = createPartialTranscriptSegment({
        segmentIdentifier: VALID_ULID,
        revision: 2,
        text: 'hello world',
        timeRange,
      })._unsafeUnwrap();
      const result = finalizeTranscriptSegment(partial, {});
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.isFinal).toBe(true);
        expect(result.value.text).toBe('hello world');
      }
    });

    it('allows overriding text and timeRange at finalization', () => {
      const partial = createPartialTranscriptSegment({
        segmentIdentifier: VALID_ULID,
        revision: 2,
        text: 'hello',
        timeRange,
      })._unsafeUnwrap();
      const newTimeRange = createTimestampRange({ startMs: 0, endMs: 1500 })._unsafeUnwrap();
      const result = finalizeTranscriptSegment(partial, {
        text: 'hello world',
        timeRange: newTimeRange,
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.text).toBe('hello world');
        expect(result.value.timeRange.endMs).toBe(1500);
      }
    });

    it('rejects finalize on already-final segment', () => {
      const partial = createPartialTranscriptSegment({
        segmentIdentifier: VALID_ULID,
        revision: 1,
        text: 'hello',
        timeRange,
      })._unsafeUnwrap();
      const final = finalizeTranscriptSegment(partial, {})._unsafeUnwrap();
      const result = finalizeTranscriptSegment(final, {});
      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.kind).toBe('invariant-violation');
    });
  });
});
