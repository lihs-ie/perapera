type Props = Readonly<{ size?: number }>;

export function CopyIcon(props: Props) {
  const size = props.size ?? 12;
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <rect x="2.5" y="4" width="6.5" height="6.5" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M5 4V2.5a1 1 0 011-1h3.5a1 1 0 011 1V6a1 1 0 01-1 1H9"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
      />
    </svg>
  );
}
