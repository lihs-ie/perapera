import { useId } from 'react';

export type Props = Readonly<{
  id?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  ariaLabel?: string;
  marks?: readonly string[];
}>;

/**
 * RangeSlider atom (perapera-scenes.jsx Slider 移植)。
 *
 * 4px の溝 + 12×12 の thumb (accent + accent-soft halo)。
 * native `<input type=range>` を visually-hidden で重ね、a11y を担保。
 * `marks` を渡すと下に numeric font で目盛文字列を均等配置。
 */
export function RangeSlider(props: Props) {
  const min = props.min ?? 0;
  const max = props.max ?? 1;
  const step = props.step ?? 0.01;
  const disabled = props.disabled === true;
  const ratio = max === min ? 0 : (props.value - min) / (max - min);
  const inputId = useId();
  const id = props.id ?? inputId;
  return (
    <div
      className="container"
      data-component="range-slider"
      style={{ display: 'flex', flexDirection: 'column', gap: 5, width: '100%' }}
    >
      <div style={{ position: 'relative', height: 12, display: 'flex', alignItems: 'center' }}>
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: '50%',
            transform: 'translateY(-50%)',
            height: 4,
            background: 'var(--pp-surface)',
            borderRadius: 2,
            border: '1px solid var(--pp-border)',
          }}
        />
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 0,
            top: '50%',
            transform: 'translateY(-50%)',
            height: 4,
            width: `${ratio * 100}%`,
            background: 'var(--pp-accent)',
            borderRadius: 2,
          }}
        />
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: `${ratio * 100}%`,
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: 'var(--pp-accent)',
            boxShadow: '0 0 0 3px rgba(45,212,191,0.14)',
          }}
        />
        <input
          id={id}
          type="range"
          value={props.value}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          aria-label={props.ariaLabel}
          onChange={(event) => props.onChange(Number(event.target.value))}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            margin: 0,
            opacity: 0,
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
        />
      </div>
      {props.marks ? (
        <div
          aria-hidden="true"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: 'var(--pp-font-numeric)',
            fontSize: 9.5,
            color: 'var(--pp-text-dim)',
          }}
        >
          {props.marks.map((mark) => (
            <span key={mark}>{mark}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
