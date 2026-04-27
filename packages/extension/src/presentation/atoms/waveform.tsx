import { useWaveformAnimation } from '../hooks/use-waveform-animation';
import { useWaveformBars } from '../hooks/use-waveform-bars';
import type { WaveformMode } from './waveform-mode';

export type { WaveformMode } from './waveform-mode';

export type AudioInputLevel = 'low' | 'optimal' | 'high';

type Props = Readonly<{
  mode?: WaveformMode;
  bars?: number;
  height?: number;
  seed?: number;
  /** 明示的に色を上書きしたいとき (audioLevel/level の自動判定を無効化) */
  color?: string;
  /** RMS 0..1。`mode==='live'` のときに 3 段階の色分けに使う */
  audioLevel?: number;
  /** audioLevel の代わりに `low/optimal/high` を直接渡したいとき */
  level?: AudioInputLevel;
}>;

/**
 * RMS の 3 段階 threshold (人の声 / 動画音声を想定):
 * - < 0.05 → low (黄): 音量が小さすぎ
 * - 0.05〜0.4 → optimal (緑): ちょうどいい
 * - >= 0.4 → high (赤): 大きすぎ・音割れ警告
 *
 * しきい値は `Issue #110` の RMS スケール (clamp 0..1, silent=0.01) と
 * 整合させた。動画/会議では大半が optimal 範囲に収まる。
 */
export const AUDIO_LEVEL_LOW_THRESHOLD = 0.05;
export const AUDIO_LEVEL_HIGH_THRESHOLD = 0.4;

export function classifyAudioLevel(rms: number): AudioInputLevel {
  if (rms < AUDIO_LEVEL_LOW_THRESHOLD) return 'low';
  if (rms >= AUDIO_LEVEL_HIGH_THRESHOLD) return 'high';
  return 'optimal';
}

const LEVEL_COLOR: Readonly<Record<AudioInputLevel, string>> = {
  low: 'var(--pp-warn)',
  optimal: 'var(--pp-accent)',
  high: 'var(--pp-err)',
};

const MODE_BASE_COLOR: Readonly<Record<WaveformMode, string>> = {
  live: 'var(--pp-accent)',
  silent: 'var(--pp-text-dim)',
  degraded: 'var(--pp-warn)',
  reconnecting: 'var(--pp-warn)',
  idle: 'var(--pp-text-dim)',
  paused: 'var(--pp-text-muted)',
};

/**
 * Waveform — 6 モード対応の bars EQ (perapera-waveform.jsx Waveform 移植 +
 * audio level による色分け拡張)。
 *
 * `mode==='live'` のとき:
 * - `level` または `audioLevel` (RMS) から AudioInputLevel を導出し、bar の
 *   base color を 3 段階に切り替える (low=warn / optimal=accent / high=err)
 * - h>0.85 のピーク bar は base が optimal (緑) のときに warn (黄) に上昇する
 *   注意警告。base が low/high のときは色を維持して全体の level シグナルを
 *   優先する。
 *
 * `silent` / `degraded` / `reconnecting` / `idle` / `paused` mode は従来通り
 * mode 固定色 (mock 互換)。
 */
export function Waveform(props: Props) {
  const mode = props.mode ?? 'live';
  const bars = props.bars ?? 56;
  const height = props.height ?? 36;
  const seed = props.seed ?? 0;
  const tick = useWaveformAnimation(mode);
  const heights = useWaveformBars(mode, bars, tick, seed);
  const level: AudioInputLevel | null =
    mode === 'live'
      ? (props.level ??
        (props.audioLevel !== undefined ? classifyAudioLevel(props.audioLevel) : 'optimal'))
      : null;
  const baseColor = resolveBaseColor(props.color, mode, level);
  const scanline = mode === 'reconnecting' ? ((tick * 0.012) % 1.4) - 0.2 : -1;

  return (
    <div
      className="container"
      data-component="waveform"
      data-mode={mode}
      data-level={level ?? undefined}
      role="img"
      aria-label="音声波形"
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 2,
        height,
        width: '100%',
        flex: 1,
        position: 'relative',
      }}
    >
      {heights.map((h, i) => {
        const barH = Math.max(2, h * height);
        const peakColor =
          mode === 'live' && h > 0.85
            ? level === 'optimal'
              ? 'var(--pp-warn)'
              : baseColor
            : baseColor;
        const opacity = computeOpacity(mode, h, i, bars, scanline);
        return (
          <div
            key={i}
            data-bar-index={i}
            style={{
              width: 2.5,
              height: barH,
              borderRadius: 1.25,
              background: peakColor,
              opacity,
              transition: mode === 'paused' ? 'all 200ms ease' : 'none',
            }}
          />
        );
      })}
      {mode === 'silent' ? (
        <div
          aria-hidden="true"
          data-part="silent-baseline"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: '50%',
            height: 1,
            background: 'var(--pp-text-dim)',
            opacity: 0.3,
            pointerEvents: 'none',
          }}
        />
      ) : null}
    </div>
  );
}

function resolveBaseColor(
  override: string | undefined,
  mode: WaveformMode,
  level: AudioInputLevel | null,
): string {
  if (override !== undefined) return override;
  if (mode === 'live' && level !== null) return LEVEL_COLOR[level];
  return MODE_BASE_COLOR[mode];
}

function computeOpacity(
  mode: WaveformMode,
  h: number,
  i: number,
  bars: number,
  scanline: number,
): number {
  if (mode === 'idle') return 0.22;
  if (mode === 'silent') return 0.4;
  if (mode === 'paused') return 0.45;
  if (mode === 'degraded') return 0.55 + h * 0.3;
  if (mode === 'reconnecting') {
    const pos = i / bars;
    const dist = Math.abs(pos - scanline);
    return 0.3 + Math.max(0, 0.7 - dist * 5) * 0.7;
  }
  return 0.55 + h * 0.45;
}
