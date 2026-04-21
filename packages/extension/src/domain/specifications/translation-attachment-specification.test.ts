import { describe, expect, it } from 'vitest';
import { parseSegmentIdentifier, type SegmentIdentifier } from '../transcript/segment-identifier';
import { createTimestampRange } from '../transcript/timestamp-range';
import {
  appendPartialTranscriptSegment,
  createTranscriptStream,
  finalizeSegment,
  type TranscriptStream,
} from '../transcript/transcript-stream';
import { canAttachTranslation } from './translation-attachment-specification';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const SEGMENT_ID_1 = '01HZX8Y1R8M7D3Q2P4T5V6W7D1';
const SEGMENT_ID_2 = '01HZX8Y1R8M7D3Q2P4T5V6W7D2';
const SEGMENT_ID_MISSING = '01HZX8Y1R8M7D3Q2P4T5V6W7DF';

const segmentId = (raw: string): SegmentIdentifier => parseSegmentIdentifier(raw)._unsafeUnwrap();

const range = (startMs: number, endMs: number) =>
  createTimestampRange({ startMs, endMs })._unsafeUnwrap();

const buildStream = (): TranscriptStream => {
  let stream = createTranscriptStream({ sessionIdentifier: SESSION_ID })._unsafeUnwrap();
  // finalized segment 1
  stream = appendPartialTranscriptSegment(stream, {
    segmentIdentifier: SEGMENT_ID_1,
    revision: 1,
    text: 'hello',
    timeRange: range(0, 1000),
  })._unsafeUnwrap();
  stream = finalizeSegment(stream, { segmentIdentifier: SEGMENT_ID_1 })._unsafeUnwrap();
  // partial (non-final) segment 2
  stream = appendPartialTranscriptSegment(stream, {
    segmentIdentifier: SEGMENT_ID_2,
    revision: 1,
    text: 'world',
    timeRange: range(1500, 2500),
  })._unsafeUnwrap();
  return stream;
};

describe('TranslationAttachmentSpecification (DD-271)', () => {
  describe('canAttachTranslation', () => {
    it('returns true when the segment is finalized', () => {
      const stream = buildStream();
      expect(canAttachTranslation(stream, segmentId(SEGMENT_ID_1))).toBe(true);
    });

    it('returns false when the segment is a partial (not yet finalized)', () => {
      const stream = buildStream();
      expect(canAttachTranslation(stream, segmentId(SEGMENT_ID_2))).toBe(false);
    });

    it('returns false when the segment does not exist in the stream', () => {
      const stream = buildStream();
      expect(canAttachTranslation(stream, segmentId(SEGMENT_ID_MISSING))).toBe(false);
    });

    it('returns false for an empty stream regardless of the segment identifier', () => {
      const empty = createTranscriptStream({ sessionIdentifier: SESSION_ID })._unsafeUnwrap();
      expect(canAttachTranslation(empty, segmentId(SEGMENT_ID_1))).toBe(false);
    });
  });
});
