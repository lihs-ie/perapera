import { ArrowIcon } from '../atoms/icons/arrow-icon';

type Props = Readonly<{
  source: string;
  target: string;
  size?: 'sm' | 'md';
}>;

/**
 * LanguagePairDisplay molecule (perapera-toolbar.jsx の言語ペア表示 移植)。
 *
 * Toolbar 中段やヘッダで言語ペアを `EN-US → JA-JP` 形式で表示。
 * size=sm (Popup SourceRow 用) / size=md (Toolbar 用) で文字サイズを切替。
 */
export function LanguagePairDisplay(props: Props) {
  const size = props.size ?? 'md';
  return (
    <div
      className="container"
      data-component="language-pair-display"
      data-size={size}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontFamily: 'var(--pp-font-numeric)',
        fontSize: size === 'sm' ? 9.5 : 10.5,
        fontWeight: 500,
        color: 'var(--pp-text-dim)',
        letterSpacing: '0.04em',
      }}
    >
      <span data-part="source">{props.source}</span>
      <ArrowIcon size={10} />
      <span data-part="target">{props.target}</span>
    </div>
  );
}
