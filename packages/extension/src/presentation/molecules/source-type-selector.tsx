import { type SourceType, SOURCE_TYPES } from '../../domain/session/source-type';
import { SourceIcon, type SourceIconKind } from '../atoms/icons/source-icon';

export type Props = Readonly<{
  value: SourceType;
  onChange: (value: SourceType) => void;
  disabled?: boolean;
}>;

const LABELS: Readonly<Record<SourceType, string>> = {
  tab: 'タブ',
  microphone: 'マイク',
  desktop: 'デスクトップ',
};

const ICON_MAP: Readonly<Record<SourceType, SourceIconKind>> = {
  tab: 'tab',
  microphone: 'microphone',
  desktop: 'desktop',
};

/**
 * SourceTypeSelector molecule (perapera-scenes.jsx StartSessionForm 移植)。
 *
 * 3-カラムの grid で tab / microphone / desktop を選択。各セルに SourceIcon と
 * 日本語ラベルを縦に配置、active 時 `--pp-accent-soft` 背景 + accent 色。
 */
export function SourceTypeSelector(props: Props) {
  const disabled = props.disabled === true;
  return (
    <div
      className="container"
      data-component="source-type-selector"
      role="radiogroup"
      aria-label="ソース種別"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 6,
      }}
    >
      {SOURCE_TYPES.map((type) => {
        const active = props.value === type;
        return (
          <button
            key={type}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={LABELS[type]}
            data-active={active ? 'true' : 'false'}
            disabled={disabled}
            onClick={() => props.onChange(type)}
            style={{
              padding: '12px 6px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              background: active ? 'var(--pp-accent-soft)' : 'transparent',
              border: `1px solid ${active ? 'rgba(45,212,191,0.4)' : 'var(--pp-border)'}`,
              borderRadius: 8,
              cursor: disabled ? 'not-allowed' : 'pointer',
              color: active ? 'var(--pp-accent)' : 'var(--pp-text-muted)',
              fontFamily: 'var(--pp-font-body)',
              fontSize: 11.5,
              fontWeight: 500,
              opacity: disabled ? 0.5 : 1,
              transition: 'background 120ms, color 120ms, border-color 120ms',
            }}
          >
            <SourceIcon kind={ICON_MAP[type]} size={22} />
            {LABELS[type]}
          </button>
        );
      })}
    </div>
  );
}
