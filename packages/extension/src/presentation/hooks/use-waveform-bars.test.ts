import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useWaveformBars } from './use-waveform-bars';

describe('useWaveformBars (perapera-waveform.jsx 数式 1:1 移植)', () => {
  it('returns array with the requested length', () => {
    const { result } = renderHook(() => useWaveformBars('live', 56, 0, 0));
    expect(result.current).toHaveLength(56);
  });

  it('idle mode returns flat 0.04 across all bars', () => {
    const { result } = renderHook(() => useWaveformBars('idle', 8, 99, 42));
    expect(result.current).toEqual([0.04, 0.04, 0.04, 0.04, 0.04, 0.04, 0.04, 0.04]);
  });

  it('silent mode oscillates within 0.018..0.054 range', () => {
    const { result } = renderHook(() => useWaveformBars('silent', 24, 5, 0));
    for (const h of result.current) {
      expect(h).toBeGreaterThanOrEqual(0.03);
      expect(h).toBeLessThanOrEqual(0.054 + 1e-9);
    }
  });

  it('live mode varies across bars (not flat)', () => {
    const { result } = renderHook(() => useWaveformBars('live', 24, 10, 0));
    const min = Math.min(...result.current);
    const max = Math.max(...result.current);
    expect(max - min).toBeGreaterThan(0.1);
  });

  it('reconnecting mode stays in 0.10..0.42 range', () => {
    const { result } = renderHook(() => useWaveformBars('reconnecting', 24, 5, 0));
    for (const h of result.current) {
      expect(h).toBeGreaterThanOrEqual(0.1);
      expect(h).toBeLessThanOrEqual(0.42 + 1e-9);
    }
  });

  it('paused mode stays in 0.12..0.67 range and is deterministic per bar index', () => {
    const a = renderHook(() => useWaveformBars('paused', 8, 0, 0));
    const b = renderHook(() => useWaveformBars('paused', 8, 999, 0));
    expect(a.result.current).toEqual(b.result.current);
    for (const h of a.result.current) {
      expect(h).toBeGreaterThanOrEqual(0.12);
      expect(h).toBeLessThanOrEqual(0.67 + 1e-9);
    }
  });

  it('live mode produces specific values for known (i, tick, seed) — formula contract', () => {
    const { result } = renderHook(() => useWaveformBars('live', 4, 0, 0));
    const expected: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const t = 0;
      const env = 0.35 + 0.65 * Math.abs(Math.sin(i * 0.18 + t * 0.6));
      const n1 = Math.sin(i * 0.45 + t * 1.7);
      const n2 = Math.sin(i * 0.21 - t * 1.2 + 1.3);
      const n3 = Math.sin(i * 1.7 + t * 2.4);
      const v = (n1 * 0.5 + n2 * 0.35 + n3 * 0.15 + 1) * 0.5;
      expected.push(0.08 + v * env * 0.92);
    }
    for (let i = 0; i < 4; i += 1) {
      const actual = result.current[i];
      const expectedValue = expected[i];
      expect(actual).toBeDefined();
      expect(expectedValue).toBeDefined();
      if (actual === undefined || expectedValue === undefined) continue;
      expect(actual).toBeCloseTo(expectedValue, 10);
    }
  });

  it('seed shifts the t parameter (live)', () => {
    const { result: a } = renderHook(() => useWaveformBars('live', 4, 0, 0));
    const { result: b } = renderHook(() => useWaveformBars('live', 4, 0, 5));
    expect(a.current).not.toEqual(b.current);
  });
});
