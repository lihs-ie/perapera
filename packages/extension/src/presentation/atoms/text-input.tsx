import React from 'react';

export type Props = Readonly<{
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  maxLength?: number;
}>;

/**
 * IMPL-522 TextInput atom。
 * `<input type="text">`。`onChange` は値だけを返す。
 */
export function TextInput(props: Props) {
  return (
    <input
      id={props.id}
      className="input"
      type="text"
      value={props.value}
      placeholder={props.placeholder}
      disabled={props.disabled === true}
      aria-label={props.ariaLabel}
      maxLength={props.maxLength}
      onChange={(event) => {
        props.onChange(event.target.value);
      }}
    />
  );
}
