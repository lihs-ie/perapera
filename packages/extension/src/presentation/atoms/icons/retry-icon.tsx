type Props = Readonly<{ size?: number }>;

export function RetryIcon(props: Props) {
  const size = props.size ?? 14;
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M11.5 7a4.5 4.5 0 11-1.4-3.2 M11.5 1.5v3.5h-3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
