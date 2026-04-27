import { CursorBlink } from '../atoms/cursor-blink';
import { PPMark } from '../atoms/pp-mark';
import { StatusPill } from '../atoms/status-pill';
import { Waveform } from '../atoms/waveform';
import type { WaveformMode } from '../atoms/waveform-mode';

type Props = Readonly<{
  sourceName: string;
  state: string;
  mode: WaveformMode;
  timestamp?: string;
  original: string;
  translation: string;
  isPartial: boolean;
}>;

/**
 * OverlayPanel organism (perapera-scenes.jsx OverlayScene 中央パネル 移植)。
 *
 * Content script Shadow DOM 内に配置される backdrop-filter blur のオーバーレイ。
 * 上段: PPMark + sourceName + StatusPill + 右寄せタイムコード、
 * 下段左: 60px 幅の Waveform、下段右: 原文 (gray) + 翻訳 (white bold) + 末尾 Cursor。
 */
export function OverlayPanel(props: Props) {
  return (
    <div
      className="container"
      data-component="overlay-panel"
      role="region"
      aria-label="字幕オーバーレイ"
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 44,
        transform: 'translateX(-50%)',
        minWidth: 520,
        maxWidth: '85%',
        background: 'rgba(10,14,20,0.78)',
        backdropFilter: 'blur(20px) saturate(160%)',
        WebkitBackdropFilter: 'blur(20px) saturate(160%)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 10,
        padding: '12px 16px',
        fontFamily: 'var(--pp-font-body)',
        color: 'var(--pp-text-primary)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 8,
          fontSize: 10.5,
          fontFamily: 'var(--pp-font-numeric)',
          color: 'var(--pp-text-dim)',
          letterSpacing: '0.10em',
        }}
      >
        <PPMark size={11} />
        <span>{props.sourceName.toUpperCase()}</span>
        <StatusPill state={props.state} size="sm" />
        <span style={{ flex: 1 }} />
        {props.timestamp !== undefined ? (
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{props.timestamp}</span>
        ) : null}
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ width: 60, paddingTop: 4 }}>
          <Waveform mode={props.mode} bars={20} height={26} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              margin: 0,
              fontSize: 12,
              color: 'var(--pp-text-muted)',
              lineHeight: 1.5,
            }}
          >
            {props.original}
          </p>
          {props.translation.length > 0 ? (
            <p
              style={{
                margin: '4px 0 0',
                fontSize: 16,
                color: 'var(--pp-text-primary)',
                fontWeight: 600,
                lineHeight: 1.45,
              }}
            >
              {props.translation}
              {props.isPartial ? <CursorBlink inline /> : null}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
