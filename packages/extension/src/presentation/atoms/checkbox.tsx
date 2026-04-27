import { CheckIcon } from './icons/check-icon';

export type Props = Readonly<{
  id?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
}>;

/**
 * Checkbox atom (perapera-scenes.jsx の auto-detect checkbox 移植)。
 *
 * Native `<input type="checkbox">` を visually-hidden にして、16×16 の
 * カスタム span で描画。チェック時は `--pp-accent` 背景 + `var(--pp-bg)` 色の
 * チェックマーク。
 */
export function Checkbox(props: Props) {
  const disabled = props.disabled === true;
  return (
    <span
      className="container"
      data-component="checkbox"
      data-checked={props.checked ? 'true' : 'false'}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 16,
        height: 16,
        flexShrink: 0,
      }}
    >
      <input
        id={props.id}
        type="checkbox"
        checked={props.checked}
        disabled={disabled}
        aria-label={props.ariaLabel}
        onChange={(event) => {
          props.onChange(event.target.checked);
        }}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          margin: 0,
          opacity: 0,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      />
      <span
        aria-hidden="true"
        style={{
          width: 16,
          height: 16,
          borderRadius: 4,
          border: `1.5px solid ${props.checked ? 'var(--pp-accent)' : 'var(--pp-border-strong)'}`,
          background: props.checked ? 'var(--pp-accent)' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--pp-bg)',
          opacity: disabled ? 0.5 : 1,
          transition: 'background 120ms, border-color 120ms',
        }}
      >
        {props.checked ? <CheckIcon size={10} /> : null}
      </span>
    </span>
  );
}
