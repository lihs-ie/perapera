import { Waveform } from './waveform';
import type { WaveformMode } from './waveform-mode';

type Props = Readonly<{
  mode?: WaveformMode;
  bars?: number;
  height?: number;
  /** RMS 0..1 — `mode==='live'` の場合に bar 色を low/optimal/high で 3 段階分け */
  audioLevel?: number;
}>;

/**
 * MiniWaveform — Popup の SourceRow 等で使う 60px 幅の compact bars EQ
 * (perapera-waveform.jsx MiniWaveform 移植 + audioLevel 透過)。
 */
export function MiniWaveform(props: Props) {
  const mode = props.mode ?? 'live';
  const bars = props.bars ?? 18;
  const height = props.height ?? 14;
  return (
    <div
      className="container"
      data-component="mini-waveform"
      style={{ width: 60, display: 'flex', flexDirection: 'row', alignItems: 'center' }}
    >
      <Waveform mode={mode} bars={bars} height={height} audioLevel={props.audioLevel} />
    </div>
  );
}
