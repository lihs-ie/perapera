export type SourceIconKind = 'tab' | 'microphone' | 'desktop';

type Props = Readonly<{
  kind: SourceIconKind;
  size?: number;
}>;

export function SourceIcon(props: Props) {
  const size = props.size ?? 22;
  if (props.kind === 'tab') {
    return (
      <svg width={size} height={size} viewBox="0 0 22 22" fill="none" aria-hidden="true">
        <rect x="2" y="5" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.4" />
        <path
          d="M2 5 L7 5 L8.5 3 L13 3 L14.5 5 L20 5"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    );
  }
  if (props.kind === 'microphone') {
    return (
      <svg width={size} height={size} viewBox="0 0 22 22" fill="none" aria-hidden="true">
        <rect x="8" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.4" />
        <path
          d="M5 11 a6 6 0 0012 0 M11 17 v3"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <rect x="2" y="3" width="18" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M7 19 L15 19 M11 16 v3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
