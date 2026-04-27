type Props = Readonly<{ size?: number }>;

export function ArrowIcon(props: Props) {
  const size = props.size ?? 10;
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path
        d="M2 5h6 M5.5 2.5L8 5L5.5 7.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
