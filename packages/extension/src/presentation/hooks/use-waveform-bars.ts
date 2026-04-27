import { useMemo } from 'react';
import type { WaveformMode } from '../atoms/waveform-mode';

/**
 * Waveform の高さ配列 (0..1 normalized) を mode 別に算出する純粋関数 hook
 * (perapera-waveform.jsx Waveform の useMemo 移植、数式は完全一致)。
 *
 * @returns 長さ `bars` の readonly 配列。各要素は 0..1 の高さ (実 px は親が
 *   `Math.max(2, h * height)` で算出する)。
 */
export function useWaveformBars(
  mode: WaveformMode,
  bars: number,
  tick: number,
  seed: number,
): readonly number[] {
  return useMemo(() => {
    const arr: number[] = [];
    const t = tick * 0.06 + seed;
    for (let i = 0; i < bars; i++) {
      if (mode === 'idle') {
        arr.push(0.04);
      } else if (mode === 'silent') {
        const n = Math.sin(i * 1.3 + tick * 0.015);
        arr.push(0.03 + (n + 1) * 0.012);
      } else if (mode === 'paused') {
        const n = Math.abs(Math.sin(i * 0.91 + 1.7)) * Math.abs(Math.sin(i * 0.31 + 0.3));
        arr.push(0.12 + n * 0.55);
      } else if (mode === 'degraded') {
        const env = 0.4 + 0.3 * Math.abs(Math.sin(i * 0.18 + t * 0.4));
        const v = (Math.sin(i * 0.45 + t * 1.1) + Math.sin(i * 1.3 - t * 0.8)) * 0.25 + 0.5;
        arr.push(0.08 + v * env * 0.55);
      } else if (mode === 'reconnecting') {
        const v = (Math.sin(i * 0.5 + t * 0.6) + 1) * 0.5;
        arr.push(0.1 + v * 0.32);
      } else {
        // live
        const env = 0.35 + 0.65 * Math.abs(Math.sin(i * 0.18 + t * 0.6));
        const n1 = Math.sin(i * 0.45 + t * 1.7);
        const n2 = Math.sin(i * 0.21 - t * 1.2 + 1.3);
        const n3 = Math.sin(i * 1.7 + t * 2.4);
        const v = (n1 * 0.5 + n2 * 0.35 + n3 * 0.15 + 1) * 0.5;
        arr.push(0.08 + v * env * 0.92);
      }
    }
    return arr;
  }, [mode, bars, tick, seed]);
}
