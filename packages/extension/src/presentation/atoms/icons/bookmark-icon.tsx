type Props = Readonly<{ size?: number }>;

export function BookmarkIcon(props: Props) {
  const size = props.size ?? 12;
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M3 1.5h6v9l-3-2-3 2z"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
        strokeLinejoin="round"
      />
    </svg>
  );
}
