import { MiniWaveform } from '../atoms/mini-waveform';
import { StatusPill } from '../atoms/status-pill';
import type { WaveformMode } from '../atoms/waveform-mode';

type Props = Readonly<{
  name: string;
  pair: string;
  state: string;
  mode: WaveformMode;
}>;

/**
 * SourceRow molecule (perapera-scenes.jsx PopupScene SourceRow 移植)。
 *
 * Popup の compact 表示。surface 背景 + 1px border、左に名前 + 言語ペア表示
 * + MiniWaveform、右に StatusPill (size=sm)。
 */
export function SourceRow(props: Props) {
  return (
    <div
      className="container"
      data-component="source-row"
      style={{
        padding: 10,
        background: 'var(--pp-surface)',
        border: '1px solid var(--pp-border)',
        borderRadius: 7,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          data-part="name"
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: 'var(--pp-text-primary)',
            marginBottom: 3,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {props.name}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontFamily: 'var(--pp-font-numeric)',
            fontSize: 9.5,
            color: 'var(--pp-text-dim)',
            letterSpacing: '0.05em',
          }}
        >
          <span data-part="pair">{props.pair}</span>
          <span aria-hidden="true">·</span>
          <MiniWaveform mode={props.mode} />
        </div>
      </div>
      <StatusPill state={props.state} size="sm" />
    </div>
  );
}
