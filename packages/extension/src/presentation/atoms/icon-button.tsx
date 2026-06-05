import type { CSSProperties, MouseEvent, ReactNode } from 'react';

type Props = Readonly<{
  label: string;
  children: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  size?: number;
  disabled?: boolean;
}>;

/**
 * 透明背景 + border のアイコンボタン (perapera-ui.jsx IconBtn 移植)。
 *
 * size 既定 30px、color は `--pp-text-muted` → hover 時 `--pp-text-primary`。
 * `danger` で `--pp-err` 色固定。aria-label 必須。
 *
 * mock の `onMouseEnter`/`onMouseLeave` で inline style 直書き換える hover を
 * そのまま再現 (CSS :hover 経由にすると値ズレリスクがあるため不採用)。
 */
export function IconButton(props: Props) {
  const size = props.size ?? 30;
  const baseColor = props.danger ? 'var(--pp-err)' : 'var(--pp-text-muted)';
  const hoverColor = props.danger ? 'var(--pp-err)' : 'var(--pp-text-primary)';
  const baseStyle: CSSProperties = {
    width: size,
    height: size,
    borderRadius: 7,
    background: 'transparent',
    border: '1px solid var(--pp-border)',
    color: baseColor,
    cursor: props.disabled ? 'not-allowed' : 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    transition: 'background 120ms, color 120ms, border-color 120ms',
    opacity: props.disabled ? 0.5 : 1,
  };
  const handleEnter = (event: MouseEvent<HTMLButtonElement>) => {
    if (props.disabled) return;
    event.currentTarget.style.background = 'rgba(255,255,255,0.04)';
    event.currentTarget.style.color = hoverColor;
  };
  const handleLeave = (event: MouseEvent<HTMLButtonElement>) => {
    if (props.disabled) return;
    event.currentTarget.style.background = 'transparent';
    event.currentTarget.style.color = baseColor;
  };
  return (
    <button
      type="button"
      className="container"
      data-component="icon-button"
      data-variant={props.danger ? 'danger' : 'default'}
      onClick={props.onClick}
      disabled={props.disabled}
      aria-label={props.label}
      title={props.label}
      style={baseStyle}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {props.children}
    </button>
  );
}
