export type Props = Readonly<{
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  maxLength?: number;
  /** default 'text'。secret 入力用に 'password' を指定できる */
  type?: 'text' | 'password';
}>;

/**
 * IMPL-522 TextInput atom。
 * `<input>`。`onChange` は値だけを返す。`type` prop で text / password を切替。
 */
export function TextInput(props: Props) {
  return (
    <input
      id={props.id}
      className="input"
      type={props.type ?? 'text'}
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
