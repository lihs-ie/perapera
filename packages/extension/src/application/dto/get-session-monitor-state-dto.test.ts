import { describe, expect, it } from 'vitest';
import {
  parseGetSessionMonitorStateInput,
  type GetSessionMonitorStateInput,
  type SessionMonitorStateOutput,
} from './get-session-monitor-state-dto';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const SESSION_ID_2 = '01HZX8Y1R8M7D3Q2P4T5V6W7A2';
const SEGMENT_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7D1';

describe('GetSessionMonitorStateDTO (DD-302)', () => {
  describe('parseGetSessionMonitorStateInput', () => {
    it('accepts a minimum payload (includeOverlayState only, sessionIds omitted)', () => {
      const result = parseGetSessionMonitorStateInput({ includeOverlayState: false });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value.sessionIds).toBeUndefined();
    });

    it('accepts a payload with sessionIds filter', () => {
      const result = parseGetSessionMonitorStateInput({
        sessionIds: [SESSION_ID, SESSION_ID_2],
        includeOverlayState: true,
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.sessionIds).toHaveLength(2);
        expect(result.value.includeOverlayState).toBe(true);
      }
    });

    it('rejects an empty sessionIds array (use undefined for all-sessions query)', () => {
      const result = parseGetSessionMonitorStateInput({
        sessionIds: [],
        includeOverlayState: false,
      });
      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.kind).toBe('validation');
    });

    it('rejects when includeOverlayState is missing', () => {
      const result = parseGetSessionMonitorStateInput({});
      expect(result.isErr()).toBe(true);
    });

    it('rejects when sessionIds contains non-string values', () => {
      const result = parseGetSessionMonitorStateInput({
        sessionIds: [SESSION_ID, 123],
        includeOverlayState: false,
      });
      expect(result.isErr()).toBe(true);
    });
  });

  describe('SessionMonitorStateOutput type shape', () => {
    it('carries a composite structure (sessions + latestSegments + optional overlayState)', () => {
      const output: SessionMonitorStateOutput = {
        sessions: [
          {
            sessionId: SESSION_ID,
            displayName: 'Example tab',
            state: 'capturing',
            sourceType: 'tab',
          },
        ],
        latestSegments: [
          {
            sessionId: SESSION_ID,
            segmentId: SEGMENT_ID,
            originalText: 'hello',
            translatedText: 'こんにちは',
          },
        ],
        overlayState: {
          sessionId: SESSION_ID,
          positionPreset: 'bottom',
          opacity: 0.8,
          maxLines: 2,
          fontScale: 1,
          showOriginalText: true,
          showTranslatedText: true,
        },
      };
      expect(output.sessions).toHaveLength(1);
      expect(output.latestSegments[0]?.translatedText).toBe('こんにちは');
      expect(output.overlayState?.positionPreset).toBe('bottom');
    });

    it('allows overlayState to be omitted when not requested', () => {
      const output: SessionMonitorStateOutput = {
        sessions: [],
        latestSegments: [],
      };
      expect(output.overlayState).toBeUndefined();
    });

    it('allows segments with only original text (translation pending)', () => {
      const output: SessionMonitorStateOutput = {
        sessions: [],
        latestSegments: [
          {
            sessionId: SESSION_ID,
            segmentId: SEGMENT_ID,
            originalText: 'hello',
          },
        ],
      };
      expect(output.latestSegments[0]?.translatedText).toBeUndefined();
    });
  });

  describe('GetSessionMonitorStateInput type shape', () => {
    it('accepts a typed literal', () => {
      const input: GetSessionMonitorStateInput = { includeOverlayState: false };
      expect(input.includeOverlayState).toBe(false);
    });
  });
});
