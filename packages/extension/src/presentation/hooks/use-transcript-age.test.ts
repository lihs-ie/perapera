import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useTranscriptAges } from './use-transcript-age';

describe('useTranscriptAges', () => {
  it('returns empty array for 0 lines', () => {
    const { result } = renderHook(() => useTranscriptAges(0));
    expect(result.current).toEqual([]);
  });

  it('single line is fresh', () => {
    const { result } = renderHook(() => useTranscriptAges(1));
    expect(result.current).toEqual(['fresh']);
  });

  it('marks last line as fresh and previous 1 as recent (RECENT_WINDOW=2)', () => {
    const { result } = renderHook(() => useTranscriptAges(3));
    expect(result.current).toEqual(['old', 'recent', 'fresh']);
  });

  it('lines beyond the recent window become old', () => {
    const { result } = renderHook(() => useTranscriptAges(6));
    expect(result.current).toEqual(['old', 'old', 'old', 'old', 'recent', 'fresh']);
  });

  it('memoizes by linesLength (same instance across same input)', () => {
    const { result, rerender } = renderHook(({ n }) => useTranscriptAges(n), {
      initialProps: { n: 4 },
    });
    const first = result.current;
    rerender({ n: 4 });
    expect(result.current).toBe(first);
  });
});
