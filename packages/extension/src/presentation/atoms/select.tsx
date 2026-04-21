import React from 'react';

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
 * IMPL-521 Select atom。
 *
 * `<select>` + `<option>` map。`onChange` は値だけを返す (DOM event は隠蔽)。
 * CLAUDE.md §React ルール準拠 (container / 単一単語 className / props.xxx)。
 */
export function Select(props: Props) {
  return (
    <select
      id={props.id}
      className="select"
      value={props.value}
      disabled={props.disabled === true}
      aria-label={props.ariaLabel}
      onChange={(event) => {
        props.onChange(event.target.value);
      }}
    >
      {props.options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
