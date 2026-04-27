import { type AudioInputLevel, Waveform, classifyAudioLevel } from '../atoms/waveform';
import type { WaveformMode } from '../atoms/waveform-mode';

type Props = Readonly<{
  mode: WaveformMode;
  audioLevel: number;
  bars?: number;
  height?: number;
}>;

const MODE_TO_LABEL: Readonly<Record<WaveformMode, string>> = {
  silent: 'NO SIG',
  degraded: 'STT.ONLY',
  reconnecting: 'RETRY',
  idle: 'IDLE',
  paused: 'PAUSED',
  live: 'LIVE',
};

const MODE_TO_LABEL_COLOR: Readonly<Record<WaveformMode, string>> = {
  silent: 'var(--pp-warn)',
  degraded: 'var(--pp-warn)',
  reconnecting: 'var(--pp-warn)',
  live: 'var(--pp-text-dim)',
  idle: 'var(--pp-text-dim)',
  paused: 'var(--pp-text-dim)',
};

const LIVE_LEVEL_LABEL: Readonly<Record<AudioInputLevel, string>> = {
  low: 'LOW',
  optimal: 'LIVE',
  high: 'HIGH',
};

const LIVE_LEVEL_COLOR: Readonly<Record<AudioInputLevel, string>> = {
  low: 'var(--pp-warn)',
  optimal: 'var(--pp-accent)',
  high: 'var(--pp-err)',
};

/**
 * ToolbarWaveformRow molecule (perapera-toolbar.jsx Toolbar の波形行 + audio
 * level 拡張)。
 *
 * 左に 40px 幅のラベル、中央に Waveform、右に 42px 幅の dB。
 * `mode==='live'` のとき、`classifyAudioLevel(audioLevel)` で 3 段階に分岐:
 * - low (<0.05): LOW (黄)
 * - optimal: LIVE (緑)
 * - high (>=0.4): HIGH (赤)
 *
 * Waveform にも同じ level を渡し、各 bar の色が level と一致して切り替わる。
 */
export function ToolbarWaveformRow(props: Props) {
  const level = props.mode === 'live' ? classifyAudioLevel(props.audioLevel) : null;
  const label = level !== null ? LIVE_LEVEL_LABEL[level] : MODE_TO_LABEL[props.mode];
  const labelColor = level !== null ? LIVE_LEVEL_COLOR[level] : MODE_TO_LABEL_COLOR[props.mode];
  const dbText =
    props.mode === 'silent'
      ? '−∞ dB'
      : props.mode === 'idle'
        ? '— dB'
        : `−${(12 - props.audioLevel * 6).toFixed(1)}dB`;
  const dbColor =
    level !== null
      ? LIVE_LEVEL_COLOR[level]
      : props.mode === 'silent'
        ? 'var(--pp-text-dim)'
        : 'var(--pp-text-muted)';
  return (
    <div
      className="container"
      data-component="toolbar-waveform-row"
      data-level={level ?? undefined}
      style={{
        padding: '2px 16px 11px',
        display: 'flex',
        alignItems: 'center',
        gap: 11,
      }}
    >
      <span
        data-part="label"
        style={{
          fontFamily: 'var(--pp-font-numeric)',
          fontSize: 9.5,
          fontWeight: 500,
          color: labelColor,
          letterSpacing: '0.10em',
          width: 40,
        }}
      >
        {label}
      </span>
      <Waveform
        mode={props.mode}
        bars={props.bars ?? 56}
        height={props.height ?? 32}
        audioLevel={props.audioLevel}
      />
      <span
        data-part="db"
        style={{
          fontFamily: 'var(--pp-font-numeric)',
          fontSize: 9.5,
          fontWeight: 500,
          color: dbColor,
          letterSpacing: '0.04em',
          width: 42,
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {dbText}
      </span>
    </div>
  );
}
