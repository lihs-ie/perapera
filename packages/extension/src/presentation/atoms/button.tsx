import type { CSSProperties, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';

export type Props = Readonly<{
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: ButtonVariant;
  type?: 'button' | 'submit';
  ariaLabel?: string;
}>;

/**
 * Button atom (perapera-scenes.jsx 「セッションを開始」「停止」等のボタン移植)。
 *
 * primary  : `--pp-accent` 背景 + `--pp-accent-fg` テキスト + glow shadow
 * secondary: 透明背景 + border + `--pp-text-primary`
 * danger   : `--pp-err-soft` 背景 + `--pp-err` テキスト
 */
export function Button(props: Props) {
  const variant = props.variant ?? 'primary';
  const disabled = props.disabled === true;
  return (
    <button
      className="container"
      data-component="button"
      data-variant={variant}
      type={props.type ?? 'button'}
      disabled={disabled}
      aria-label={props.ariaLabel}
      onClick={props.onClick}
      style={resolveStyle(variant, disabled)}
    >
      {props.children}
    </button>
  );
}

function resolveStyle(variant: ButtonVariant, disabled: boolean): CSSProperties {
  const base: CSSProperties = {
    padding: '12px 16px',
    fontFamily: 'var(--pp-font-body)',
    fontSize: 13.5,
    fontWeight: 600,
    borderRadius: 8,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    letterSpacing: '0.02em',
    transition: 'background 120ms, color 120ms, border-color 120ms, opacity 120ms',
  };
  if (variant === 'primary') {
    return {
      ...base,
      background: 'var(--pp-accent)',
      color: 'var(--pp-accent-fg)',
      border: 'none',
      boxShadow: '0 0 24px rgba(45,212,191,0.25)',
    };
  }
  if (variant === 'danger') {
    return {
      ...base,
      padding: '5px 12px',
      fontSize: 11.5,
      background: 'var(--pp-err-soft)',
      color: 'var(--pp-err)',
      border: '1px solid rgba(248,113,113,0.28)',
      borderRadius: 6,
      letterSpacing: '0.03em',
    };
  }
  return {
    ...base,
    background: 'transparent',
    color: 'var(--pp-text-primary)',
    border: '1px solid var(--pp-border)',
  };
}
