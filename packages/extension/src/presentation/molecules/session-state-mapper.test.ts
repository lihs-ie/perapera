import { describe, expect, it } from 'vitest';
import { mapSessionStateToStatusPill, mapSessionStateToWaveformMode } from './session-state-mapper';

describe('mapSessionStateToWaveformMode', () => {
  it.each(['capturing', 'transcribing', 'translating'] as const)(
    '%s with audioSilent=false → live',
    (state) => {
      expect(mapSessionStateToWaveformMode(state, false)).toBe('live');
    },
  );

  it.each(['capturing', 'transcribing', 'translating'] as const)(
    '%s with audioSilent=true → silent',
    (state) => {
      expect(mapSessionStateToWaveformMode(state, true)).toBe('silent');
    },
  );

  it('degraded → degraded (regardless of audioSilent)', () => {
    expect(mapSessionStateToWaveformMode('degraded', false)).toBe('degraded');
    expect(mapSessionStateToWaveformMode('degraded', true)).toBe('degraded');
  });

  it.each(['connecting', 'reconnecting', 'requesting_permission'] as const)(
    '%s → reconnecting',
    (state) => {
      expect(mapSessionStateToWaveformMode(state, false)).toBe('reconnecting');
    },
  );

  it('paused → paused', () => {
    expect(mapSessionStateToWaveformMode('paused', false)).toBe('paused');
  });

  it.each(['idle', 'stopped', 'error'] as const)('%s → idle', (state) => {
    expect(mapSessionStateToWaveformMode(state, false)).toBe('idle');
  });
});

describe('mapSessionStateToStatusPill', () => {
  it('requesting_permission is normalized to connecting (mock STATUS_MAP compatibility)', () => {
    expect(mapSessionStateToStatusPill('requesting_permission')).toBe('connecting');
  });

  it.each([
    'capturing',
    'transcribing',
    'translating',
    'connecting',
    'reconnecting',
    'degraded',
    'error',
    'paused',
    'idle',
    'stopped',
  ] as const)('%s passes through', (state) => {
    expect(mapSessionStateToStatusPill(state)).toBe(state);
  });
});
