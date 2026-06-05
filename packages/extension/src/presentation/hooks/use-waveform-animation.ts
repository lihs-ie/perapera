import { useEffect, useState } from 'react';
import type { WaveformMode } from '../atoms/waveform-mode';

/**
 * Waveform アニメーションの tick を進める raf loop hook
 * (perapera-waveform.jsx Waveform の useEffect 移植)。
 *
 * - mode が 'idle' / 'paused' のときは raf を起動せず tick=0 を返す
 * - それ以外は requestAnimationFrame ループで毎フレーム tick++
 * - cleanup で cancelAnimationFrame
 */
export function useWaveformAnimation(mode: WaveformMode): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (mode === 'idle' || mode === 'paused') return;
    let raf = 0;
    const loop = () => {
      setTick((t) => t + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [mode]);
  return tick;
}
