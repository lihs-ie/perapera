type Props = Readonly<{
  size?: number;
  color?: string;
}>;

/**
 * PeraPera ブランドマーク (perapera-ui.jsx PPMark の TypeScript 移植)。
 *
 * 2 つの重なる角丸長方形で「対話のオーバーレイ」を表現。色は `color` prop または
 * `--pp-accent` を継承する。
 */
export function PPMark(props: Props) {
  const size = props.size ?? 18;
  const color = props.color ?? 'var(--pp-accent)';
  return (
    <svg
      className="container"
      data-component="pp-mark"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ color }}
    >
      <rect x="2.5" y="4" width="14" height="10" rx="4" fill="currentColor" opacity="0.35" />
      <rect x="7.5" y="9" width="14" height="10" rx="4" fill="currentColor" />
      <path d="M11 19 L12.5 22 L14 19" fill="currentColor" opacity="0.7" />
    </svg>
  );
}
