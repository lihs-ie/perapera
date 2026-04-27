type Props = Readonly<{ size?: number }>;

export function SettingsIcon(props: Props) {
  const size = props.size ?? 14;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M8 1.5v1.8 M8 12.7v1.8 M14.5 8h-1.8 M3.3 8H1.5 M12.6 3.4l-1.3 1.3 M4.7 11.3l-1.3 1.3 M12.6 12.6l-1.3-1.3 M4.7 4.7L3.4 3.4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}
