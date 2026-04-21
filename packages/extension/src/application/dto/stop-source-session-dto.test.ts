import { describe, expect, it } from 'vitest';
import {
  parseStopSourceSessionInput,
  type StopSourceSessionInput,
  type StopSourceSessionOutput,
} from './stop-source-session-dto';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';

describe('StopSourceSessionDTO (DD-306)', () => {
  describe('parseStopSourceSessionInput', () => {
    it('accepts the minimum payload (sessionId only)', () => {
      const result = parseStopSourceSessionInput({ sessionId: SESSION_ID });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.sessionId).toBe(SESSION_ID);
        expect(result.value.reason).toBeUndefined();
      }
    });

    it('accepts a payload with optional reason', () => {
      const result = parseStopSourceSessionInput({
        sessionId: SESSION_ID,
        reason: 'user_requested',
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value.reason).toBe('user_requested');
    });

    it('rejects when sessionId is missing', () => {
      const result = parseStopSourceSessionInput({});
      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.kind).toBe('validation');
    });

    it('rejects when sessionId is not a string', () => {
      const result = parseStopSourceSessionInput({ sessionId: 123 });
      expect(result.isErr()).toBe(true);
    });

    it('rejects when sessionId is an empty string', () => {
      const result = parseStopSourceSessionInput({ sessionId: '' });
      expect(result.isErr()).toBe(true);
    });

    it('rejects a non-object payload', () => {
      expect(parseStopSourceSessionInput(null).isErr()).toBe(true);
      expect(parseStopSourceSessionInput('bad').isErr()).toBe(true);
    });
  });

  describe('StopSourceSessionOutput type shape', () => {
    it('carries sessionId, state, and stoppedAt', () => {
      const output: StopSourceSessionOutput = {
        sessionId: SESSION_ID,
        state: 'stopped',
        stoppedAt: '2026-04-21T00:10:00.000Z',
      };
      expect(output.state).toBe('stopped');
    });
  });

  describe('StopSourceSessionInput type narrowing', () => {
    it('permits reason omission in the type definition', () => {
      const minimal: StopSourceSessionInput = { sessionId: SESSION_ID };
      expect(minimal.reason).toBeUndefined();
    });
  });
});
