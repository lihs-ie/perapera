type Props = Readonly<{ size?: number }>;

export function ExportIcon(props: Props) {
  const size = props.size ?? 14;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 1.5v9 M5 7l3-3 3 3"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2 11v2.5a1 1 0 001 1h10a1 1 0 001-1V11"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
