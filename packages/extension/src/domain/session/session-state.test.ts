import { describe, expect, it } from 'vitest';
import { SESSION_STATES, parseSessionState } from './session-state.js';

describe('SessionState', () => {
  it('enumerates exactly 11 states (DD-233)', () => {
    expect(SESSION_STATES).toHaveLength(11);
    expect(SESSION_STATES).toEqual([
      'idle',
      'requesting_permission',
      'connecting',
      'capturing',
      'transcribing',
      'translating',
      'paused',
      'reconnecting',
      'degraded',
      'stopped',
      'error',
    ]);
  });

  it.each(SESSION_STATES)('accepts %s', (state) => {
    const result = parseSessionState(state);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value).toBe(state);
  });

  it('rejects unknown state', () => {
    const result = parseSessionState('done');
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('validation');
  });

  it('rejects non-string value', () => {
    expect(parseSessionState(0).isErr()).toBe(true);
  });
});
