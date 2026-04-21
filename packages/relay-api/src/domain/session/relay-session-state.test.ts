import { describe, expect, it } from 'vitest';
import { parseRelaySessionState, RELAY_SESSION_STATES } from './relay-session-state';

describe('parseRelaySessionState', () => {
  it.each(RELAY_SESSION_STATES)('accepts %s', (state) => {
    const result = parseRelaySessionState(state);
    expect(result.isOk()).toBe(true);
  });

  it('rejects unknown values', () => {
    const result = parseRelaySessionState('unknown-state');
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('validation');
  });

  it('rejects non-string values', () => {
    expect(parseRelaySessionState(0).isErr()).toBe(true);
    expect(parseRelaySessionState(null).isErr()).toBe(true);
  });
});
