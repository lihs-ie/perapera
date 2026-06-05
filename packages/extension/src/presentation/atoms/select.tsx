import { ChevronDownIcon } from './icons/chevron-down-icon';

export type SelectOption = Readonly<{
  value: string;
  label: string;
}>;

export type Props = Readonly<{
  id?: string;
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  ariaLabel?: string;
}>;

/**
 * Select atom (perapera-scenes.jsx Select 移植)。
 *
 * Native `<select>` を使い、`appearance: none` で chevron アイコンを overlay。
 * 背景 `--pp-surface`、border `--pp-border`、focus 時に accent outline。
 */
export function Select(props: Props) {
  const disabled = props.disabled === true;
  return (
    <span
      className="container"
      data-component="select"
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        width: '100%',
        color: 'var(--pp-text-muted)',
      }}
    >
      <select
        id={props.id}
        value={props.value}
        disabled={disabled}
        aria-label={props.ariaLabel}
        onChange={(event) => {
          props.onChange(event.target.value);
        }}
        style={{
          appearance: 'none',
          WebkitAppearance: 'none',
          width: '100%',
          padding: '9px 28px 9px 11px',
          background: 'var(--pp-surface)',
          border: '1px solid var(--pp-border)',
          borderRadius: 6,
          color: 'var(--pp-text-primary)',
          fontFamily: 'var(--pp-font-body)',
          fontSize: 12.5,
          cursor: disabled ? 'not-allowed' : 'pointer',
          outline: 'none',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          right: 11,
          top: '50%',
          transform: 'translateY(-50%)',
          pointerEvents: 'none',
          display: 'inline-flex',
        }}
      >
        <ChevronDownIcon size={9} />
      </span>
    </span>
  );
}
