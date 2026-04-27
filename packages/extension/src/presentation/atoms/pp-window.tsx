import type { ReactNode } from 'react';
import { PPMark } from './pp-mark';

type Props = Readonly<{
  width?: number | string;
  height?: number | string;
  title?: string;
  subtitle?: string;
  children: ReactNode;
}>;

/**
 * macOS-style window chrome (perapera-ui.jsx PPWindow 移植)。
 *
 * Main window / Settings 等の独立ウィンドウのフレームとして使う。
 * 上部 34px に traffic light + 中央 PPMark + title + subtitle、
 * box-shadow は perapera-ui.jsx の PPWindow と同一の多重影。
 *
 * mock の構造に厳密一致させるため、レイアウト値は inline style で書く
 * (CSS class への外出しは値ズレリスクが高いため不採用)。
 */
export function PPWindow(props: Props) {
  const width = props.width ?? 480;
  const height = props.height ?? 680;
  const title = props.title ?? 'perapera';
  return (
    <div
      className="container"
      data-component="pp-window"
      style={{
        width,
        height,
        borderRadius: 12,
        overflow: 'hidden',
        background: 'var(--pp-bg)',
        boxShadow:
          '0 0 0 0.5px rgba(255,255,255,0.04), 0 0 0 1px rgba(0,0,0,0.5), 0 24px 60px rgba(0,0,0,0.55), 0 8px 18px rgba(0,0,0,0.35)',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--pp-font-body)',
        color: 'var(--pp-text-primary)',
        position: 'relative',
      }}
    >
      <div
        style={{
          height: 34,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0 12px',
          background: 'linear-gradient(180deg, #1c2433 0%, #131a25 100%)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div style={{ display: 'flex', gap: 8 }} aria-hidden="true">
          {(['#ff5f57', '#febc2e', '#28c840'] as const).map((bg) => (
            <span
              key={bg}
              style={{
                width: 11,
                height: 11,
                borderRadius: '50%',
                background: bg,
                boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,0.2)',
              }}
            />
          ))}
        </div>
        <div
          style={{
            flex: 1,
            textAlign: 'center',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 7,
          }}
        >
          <PPMark size={12} />
          <span
            style={{
              fontFamily: 'var(--pp-font-numeric)',
              fontSize: 11.5,
              fontWeight: 500,
              letterSpacing: '0.04em',
              color: 'var(--pp-text-muted)',
            }}
          >
            {title}
          </span>
          {props.subtitle ? (
            <span
              style={{
                fontFamily: 'var(--pp-font-numeric)',
                fontSize: 10.5,
                fontWeight: 500,
                color: 'var(--pp-text-dim)',
                letterSpacing: '0.06em',
              }}
            >
              · {props.subtitle}
            </span>
          ) : null}
        </div>
        <div style={{ width: 44 }} aria-hidden="true" />
      </div>
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {props.children}
      </div>
    </div>
  );
}
