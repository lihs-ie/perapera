export type SegmentedRadioOption = Readonly<{
  value: string;
  label: string;
}>;

export type Props = Readonly<{
  options: readonly SegmentedRadioOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  ariaLabel?: string;
}>;

/**
 * SegmentedRadio atom (perapera-scenes.jsx SegRadio 移植)。
 *
 * 横並びラジオの代替。surface 背景 + border 1px の wrapper、各 button が
 * active 時に `--pp-accent-soft` 背景 + `--pp-accent` color、inactive 時に
 * 透明 + `--pp-text-muted`。
 */
export function SegmentedRadio(props: Props) {
  const disabled = props.disabled === true;
  return (
    <div
      className="container"
      data-component="segmented-radio"
      role="radiogroup"
      aria-label={props.ariaLabel}
      style={{
        display: 'inline-flex',
        background: 'var(--pp-surface)',
        border: '1px solid var(--pp-border)',
        borderRadius: 6,
        padding: 2,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {props.options.map((option) => {
        const active = option.value === props.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => props.onChange(option.value)}
            data-active={active ? 'true' : 'false'}
            style={{
              padding: '5px 11px',
              background: active ? 'var(--pp-accent-soft)' : 'transparent',
              color: active ? 'var(--pp-accent)' : 'var(--pp-text-muted)',
              border: 'none',
              borderRadius: 4,
              cursor: disabled ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--pp-font-body)',
              fontSize: 11.5,
              fontWeight: 500,
              transition: 'background 120ms, color 120ms',
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
