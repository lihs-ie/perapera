import { describe, expect, it } from 'vitest';
import { parseSessionIdentifier } from '../../domain/session/session-identifier';
import type { OverlayRenderModel } from '../ports/overlay-presenter';
import {
  parseHandleTranscriptPartialInput,
  type HandleTranscriptPartialInput,
  type HandleTranscriptPartialOutput,
} from './handle-transcript-partial-dto';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const SEGMENT_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7D1';

describe('HandleTranscriptPartialDTO (DD-304)', () => {
  describe('parseHandleTranscriptPartialInput', () => {
    it('accepts a valid payload', () => {
      const result = parseHandleTranscriptPartialInput({
        sessionId: SESSION_ID,
        segmentId: SEGMENT_ID,
        revision: 1,
        text: 'hello world',
        timeRange: { startMs: 0, endMs: 1500 },
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value.revision).toBe(1);
    });

    it('rejects revision < 1', () => {
      const result = parseHandleTranscriptPartialInput({
        sessionId: SESSION_ID,
        segmentId: SEGMENT_ID,
        revision: 0,
        text: 'hello',
        timeRange: { startMs: 0, endMs: 100 },
      });
      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.kind).toBe('validation');
    });

    it('rejects non-integer revision', () => {
      const result = parseHandleTranscriptPartialInput({
        sessionId: SESSION_ID,
        segmentId: SEGMENT_ID,
        revision: 1.5,
        text: 'hello',
        timeRange: { startMs: 0, endMs: 100 },
      });
      expect(result.isErr()).toBe(true);
    });

    it('rejects empty text', () => {
      const result = parseHandleTranscriptPartialInput({
        sessionId: SESSION_ID,
        segmentId: SEGMENT_ID,
        revision: 1,
        text: '',
        timeRange: { startMs: 0, endMs: 100 },
      });
      expect(result.isErr()).toBe(true);
    });

    it('rejects timeRange where startMs > endMs', () => {
      const result = parseHandleTranscriptPartialInput({
        sessionId: SESSION_ID,
        segmentId: SEGMENT_ID,
        revision: 1,
        text: 'hello',
        timeRange: { startMs: 200, endMs: 100 },
      });
      expect(result.isErr()).toBe(true);
    });

    it('rejects negative timestamp offsets', () => {
      const result = parseHandleTranscriptPartialInput({
        sessionId: SESSION_ID,
        segmentId: SEGMENT_ID,
        revision: 1,
        text: 'hello',
        timeRange: { startMs: -1, endMs: 100 },
      });
      expect(result.isErr()).toBe(true);
    });
  });

  describe('HandleTranscriptPartialOutput type shape', () => {
    it('carries renderModel from OverlayPresenter port', () => {
      const renderModel: OverlayRenderModel = {
        sessionIdentifier: parseSessionIdentifier(SESSION_ID)._unsafeUnwrap(),
        lines: [],
      };
      const output: HandleTranscriptPartialOutput = {
        sessionId: SESSION_ID,
        segmentId: SEGMENT_ID,
        revision: 1,
        renderModel,
      };
      expect(output.revision).toBe(1);
    });
  });

  describe('HandleTranscriptPartialInput type shape', () => {
    it('accepts a typed literal', () => {
      const input: HandleTranscriptPartialInput = {
        sessionId: SESSION_ID,
        segmentId: SEGMENT_ID,
        revision: 1,
        text: 'hi',
        timeRange: { startMs: 0, endMs: 50 },
      };
      expect(input.segmentId).toBe(SEGMENT_ID);
    });
  });
});
