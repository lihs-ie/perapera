/**
 * StatusPill — SessionState を受けて pulse + ラベル付きの pill を描画
 * (perapera-ui.jsx StatusPill 移植)。
 *
 * mock の STATUS_MAP (10 状態) を完全一致で内蔵。
 * SessionState に存在する `requesting_permission` は session-state-mapper で
 * `connecting` に正規化されて到達する設計 (Phase E)。
 */

export const STATUS_PILL_STATES = [
  'capturing',
  'transcribing',
  'translating',
  'connecting',
  'reconnecting',
  'degraded',
  'error',
  'paused',
  'idle',
  'stopped',
] as const;

export type StatusPillState = (typeof STATUS_PILL_STATES)[number];

type Variant = Readonly<{
  label: string;
  color: string;
  pulse: boolean;
}>;

const STATE_TO_VARIANT: Readonly<Record<StatusPillState, Variant>> = {
  capturing: { label: 'CAPTURING', color: 'var(--pp-accent)', pulse: true },
  transcribing: { label: 'TRANSCRIBING', color: 'var(--pp-accent)', pulse: true },
  translating: { label: 'TRANSLATING', color: 'var(--pp-accent)', pulse: true },
  connecting: { label: 'CONNECTING', color: 'var(--pp-warn)', pulse: true },
  reconnecting: { label: 'RECONNECTING', color: 'var(--pp-warn)', pulse: true },
  degraded: { label: 'DEGRADED', color: 'var(--pp-warn)', pulse: false },
  error: { label: 'ERROR', color: 'var(--pp-err)', pulse: false },
  paused: { label: 'PAUSED', color: 'var(--pp-text-muted)', pulse: false },
  idle: { label: 'IDLE', color: 'var(--pp-text-dim)', pulse: false },
  stopped: { label: 'STOPPED', color: 'var(--pp-text-dim)', pulse: false },
};

type Props = Readonly<{
  state: string;
  size?: 'sm' | 'md';
  label?: string;
}>;

const VARIANT_BY_STRING: ReadonlyMap<string, Variant> = new Map(Object.entries(STATE_TO_VARIANT));

function resolve(state: string): Variant {
  return VARIANT_BY_STRING.get(state) ?? STATE_TO_VARIANT.idle;
}

export function StatusPill(props: Props) {
  const variant = resolve(props.state);
  const size = props.size ?? 'md';
  const label = props.label ?? variant.label;
  return (
    <span
      className="container"
      data-component="status-pill"
      data-state={props.state}
      data-pulse={variant.pulse ? 'true' : 'false'}
      data-size={size}
      role="status"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: size === 'sm' ? '2px 8px 2px 6px' : '3px 10px 3px 8px',
        background: 'rgba(255,255,255,0.03)',
        borderRadius: 999,
        fontFamily: 'var(--pp-font-numeric)',
        fontWeight: 500,
        fontSize: size === 'sm' ? 9.5 : 10.5,
        letterSpacing: '0.10em',
        color: variant.color,
        border: `1px solid color-mix(in srgb, ${variant.color} 20%, transparent)`,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        aria-hidden="true"
        data-part="dot"
        style={{ position: 'relative', width: 6, height: 6, display: 'inline-block' }}
      >
        <span
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background: variant.color,
          }}
        />
        {variant.pulse ? (
          <span
            style={{
              position: 'absolute',
              inset: -2,
              borderRadius: '50%',
              background: variant.color,
              opacity: 0.4,
              animation: 'pp-pulse 1.6s ease-out infinite',
            }}
          />
        ) : null}
      </span>
      <span data-part="label">{label}</span>
    </span>
  );
}
