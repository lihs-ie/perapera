type Props = Readonly<{ size?: number }>;

export function PauseIcon(props: Props) {
  const size = props.size ?? 14;
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="3" y="2.5" width="2.5" height="9" rx="0.5" fill="currentColor" />
      <rect x="8.5" y="2.5" width="2.5" height="9" rx="0.5" fill="currentColor" />
    </svg>
  );
}
