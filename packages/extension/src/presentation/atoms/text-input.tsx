import { useState } from 'react';

export type Props = Readonly<{
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  maxLength?: number;
  type?: 'text' | 'password' | 'number';
  min?: number;
  max?: number;
  step?: number;
}>;

/**
 * TextInput atom (perapera-scenes.jsx の表示名 input 移植)。
 *
 * 背景 `--pp-surface`、border `--pp-border`、focus 時に 1.5px accent outline。
 */
export function TextInput(props: Props) {
  const disabled = props.disabled === true;
  const [focused, setFocused] = useState(false);
  return (
    <input
      id={props.id}
      className="container"
      data-component="text-input"
      data-focused={focused ? 'true' : 'false'}
      type={props.type ?? 'text'}
      value={props.value}
      placeholder={props.placeholder}
      disabled={disabled}
      aria-label={props.ariaLabel}
      maxLength={props.maxLength}
      min={props.min}
      max={props.max}
      step={props.step}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(event) => {
        props.onChange(event.target.value);
      }}
      style={{
        width: '100%',
        boxSizing: 'border-box',
        padding: '9px 11px',
        background: 'var(--pp-surface)',
        border: focused ? '1.5px solid var(--pp-accent)' : '1px solid var(--pp-border)',
        borderRadius: 6,
        color: 'var(--pp-text-primary)',
        fontFamily: 'var(--pp-font-body)',
        fontSize: 13,
        outline: 'none',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'text',
      }}
    />
  );
}
