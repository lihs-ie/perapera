type Props = Readonly<{ size?: number }>;

export function WarningTriangleIcon(props: Props) {
  const size = props.size ?? 13;
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M7 1 L13 12 L1 12 Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M7 5v3 M7 10v.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
