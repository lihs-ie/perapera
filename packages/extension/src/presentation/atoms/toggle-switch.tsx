export type Props = Readonly<{
  id?: string;
  on: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
}>;

/**
 * ToggleSwitch atom (perapera-scenes.jsx Toggle 移植)。
 *
 * 32×18 ピル + 14×14 サムネイル。ON で `--pp-accent` 背景、サムネイルは
 * `--pp-bg` 色の dot に。OFF で `--pp-surface` + `--pp-text-muted` dot。
 */
export function ToggleSwitch(props: Props) {
  const disabled = props.disabled === true;
  return (
    <button
      type="button"
      id={props.id}
      role="switch"
      aria-checked={props.on}
      aria-label={props.ariaLabel}
      disabled={disabled}
      onClick={() => props.onChange(!props.on)}
      className="container"
      data-component="toggle-switch"
      data-on={props.on ? 'true' : 'false'}
      style={{
        width: 32,
        height: 18,
        padding: 0,
        borderRadius: 999,
        background: props.on ? 'var(--pp-accent)' : 'var(--pp-surface)',
        border: `1px solid ${props.on ? 'var(--pp-accent)' : 'var(--pp-border)'}`,
        position: 'relative',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'background 150ms, border-color 150ms',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 1,
          left: props.on ? 15 : 1,
          width: 14,
          height: 14,
          borderRadius: '50%',
          background: props.on ? 'var(--pp-bg)' : 'var(--pp-text-muted)',
          transition: 'left 150ms',
        }}
      />
    </button>
  );
}
