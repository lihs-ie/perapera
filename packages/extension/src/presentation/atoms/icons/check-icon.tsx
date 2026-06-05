type Props = Readonly<{ size?: number }>;

export function CheckIcon(props: Props) {
  const size = props.size ?? 10;
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path
        d="M2 5 L4 7 L8 3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
