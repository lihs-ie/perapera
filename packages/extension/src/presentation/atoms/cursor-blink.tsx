type Props = Readonly<{
  inline?: boolean;
}>;

/**
 * Cursor — partial transcript の末尾で点滅する 7×0.85em のキャレット
 * (perapera-transcript.jsx Cursor 移植)。
 *
 * `pp-cursor` keyframes を 1.05s steps(2) infinite で適用し、ブロック
 * カーソル風の 2 ステップ瞬き。`inline` で marginLeft を 2 / 3 に切替。
 */
export function CursorBlink(props: Props) {
  const inline = props.inline ?? false;
  return (
    <span
      className="container"
      data-component="cursor-blink"
      data-inline={inline ? 'true' : 'false'}
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: 7,
        height: '0.85em',
        marginLeft: inline ? 2 : 3,
        background: 'var(--pp-accent)',
        verticalAlign: '-1px',
        borderRadius: 1,
        animation: 'pp-cursor 1.05s steps(2) infinite',
        boxShadow: '0 0 8px rgba(45,212,191,0.35)',
      }}
    />
  );
}
