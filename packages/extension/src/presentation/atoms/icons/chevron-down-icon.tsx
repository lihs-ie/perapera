type Props = Readonly<{ size?: number }>;

export function ChevronDownIcon(props: Props) {
  const size = props.size ?? 9;
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path
        d="M2 4 L5 7 L8 4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
