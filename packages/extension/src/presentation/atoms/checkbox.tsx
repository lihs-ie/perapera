export type Props = Readonly<{
  id?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
}>;

/**
 * IMPL-523 Checkbox atom。
 * `<input type="checkbox">`。`onChange` は checked 状態だけを返す。
 */
export function Checkbox(props: Props) {
  return (
    <input
      id={props.id}
      className="checkbox"
      type="checkbox"
      checked={props.checked}
      disabled={props.disabled === true}
      aria-label={props.ariaLabel}
      onChange={(event) => {
        props.onChange(event.target.checked);
      }}
    />
  );
}
