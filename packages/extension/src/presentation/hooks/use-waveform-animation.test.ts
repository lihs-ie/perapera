import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWaveformAnimation } from './use-waveform-animation';

describe('useWaveformAnimation (perapera-waveform.jsx raf loop 移植)', () => {
  let rafCallbacks: Array<FrameRequestCallback> = [];
  let rafId = 0;

  beforeEach(() => {
    rafCallbacks = [];
    rafId = 0;
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      rafId += 1;
      rafCallbacks.push(cb);
      return rafId;
    });
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function flushFrame(): void {
    const next = rafCallbacks.shift();
    if (next) {
      act(() => {
        next(performance.now());
      });
    }
  }

  it('returns tick=0 initially', () => {
    const { result } = renderHook(() => useWaveformAnimation('live'));
    expect(result.current).toBe(0);
  });

  it('advances tick on each animation frame in live mode', () => {
    const { result } = renderHook(() => useWaveformAnimation('live'));
    expect(result.current).toBe(0);
    flushFrame();
    expect(result.current).toBe(1);
    flushFrame();
    expect(result.current).toBe(2);
  });

  it('does not request animation frames when mode=idle', () => {
    renderHook(() => useWaveformAnimation('idle'));
    expect(globalThis.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it('does not request animation frames when mode=paused', () => {
    renderHook(() => useWaveformAnimation('paused'));
    expect(globalThis.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it('cancels the pending frame on unmount', () => {
    const { unmount } = renderHook(() => useWaveformAnimation('live'));
    unmount();
    expect(globalThis.cancelAnimationFrame).toHaveBeenCalled();
  });

  it.each(['silent', 'degraded', 'reconnecting'] as const)(
    'starts raf loop for animated mode=%s',
    (mode) => {
      renderHook(() => useWaveformAnimation(mode));
      expect(globalThis.requestAnimationFrame).toHaveBeenCalled();
    },
  );
});
