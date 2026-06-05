type Props = Readonly<{ size?: number }>;

export function GlobeIcon(props: Props) {
  const size = props.size ?? 14;
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M1.5 7h11 M7 1.5c2 2 2 9 0 11 M7 1.5c-2 2-2 9 0 11"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}
