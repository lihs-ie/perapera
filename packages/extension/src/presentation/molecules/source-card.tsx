import { RetryIcon } from '../atoms/icons/retry-icon';
import { StatusPill } from '../atoms/status-pill';
import { Waveform } from '../atoms/waveform';
import type { WaveformMode } from '../atoms/waveform-mode';

type Props = Readonly<{
  name: string;
  pair: readonly [string, string];
  state: string;
  mode: WaveformMode;
  original?: string | null;
  translation?: string | null;
  reason?: string;
  onRetry?: () => void;
}>;

/**
 * SourceCard molecule (perapera-scenes.jsx SidePanelScene SourceCard 移植)。
 *
 * SidePanel の expanded 表示。surface 背景 + 1px border、上段に名前 + 言語ペア +
 * StatusPill (size=sm)、中段に Waveform (bars=48, height=22)、下段に
 * 原文 + 翻訳。reason があれば下に warn 色のバナーと再試行ボタン。
 */
export function SourceCard(props: Props) {
  const hasContent = (props.original ?? '') !== '' || (props.translation ?? '') !== '';
  return (
    <article
      className="container"
      data-component="source-card"
      style={{
        background: 'var(--pp-surface)',
        border: '1px solid var(--pp-border)',
        borderRadius: 9,
        overflow: 'hidden',
      }}
    >
      <header
        style={{
          padding: '11px 12px 7px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3
            style={{
              margin: 0,
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--pp-text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {props.name}
          </h3>
          <div
            data-part="pair"
            style={{
              fontFamily: 'var(--pp-font-numeric)',
              fontSize: 10,
              color: 'var(--pp-text-dim)',
              letterSpacing: '0.05em',
              marginTop: 2,
            }}
          >
            {props.pair[0]} → {props.pair[1]}
          </div>
        </div>
        <StatusPill state={props.state} size="sm" />
      </header>
      <div style={{ padding: '0 12px 8px' }}>
        <Waveform mode={props.mode} bars={48} height={22} />
      </div>
      {hasContent ? (
        <div
          data-part="content"
          style={{
            padding: '8px 12px 11px',
            borderTop: '1px solid var(--pp-border)',
          }}
        >
          {props.original !== null && props.original !== undefined && props.original !== '' ? (
            <p
              data-part="original"
              style={{
                margin: 0,
                fontSize: 11.5,
                color: 'var(--pp-text-muted)',
                lineHeight: 1.5,
              }}
            >
              {props.original}
            </p>
          ) : null}
          {props.translation !== null &&
          props.translation !== undefined &&
          props.translation !== '' ? (
            <p
              data-part="translation"
              style={{
                margin: '4px 0 0',
                fontSize: 13,
                color: 'var(--pp-text-primary)',
                lineHeight: 1.5,
                fontWeight: 600,
              }}
            >
              {props.translation}
            </p>
          ) : null}
        </div>
      ) : null}
      {props.reason !== undefined && props.reason !== '' ? (
        <div
          data-part="reason"
          role="alert"
          style={{
            padding: '6px 12px 9px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontFamily: 'var(--pp-font-numeric)',
            fontSize: 9.5,
            color: 'var(--pp-warn)',
            letterSpacing: '0.05em',
          }}
        >
          <span>{props.reason}</span>
          {props.onRetry !== undefined ? (
            <button
              type="button"
              onClick={props.onRetry}
              aria-label="再試行"
              style={{
                marginLeft: 'auto',
                padding: '3px 8px',
                background: 'transparent',
                border: '1px solid rgba(245,158,11,0.33)',
                color: 'var(--pp-warn)',
                borderRadius: 4,
                fontSize: 10,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontFamily: 'var(--pp-font-body)',
              }}
            >
              <RetryIcon size={11} />
              再試行
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
