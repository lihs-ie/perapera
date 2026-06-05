type Props = Readonly<{ size?: number }>;

export function CloseIcon(props: Props) {
  const size = props.size ?? 12;
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2 2l8 8 M10 2l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
