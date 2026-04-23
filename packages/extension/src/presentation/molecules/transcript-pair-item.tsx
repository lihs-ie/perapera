export type Props = Readonly<{
  originalText: string | null;
  translatedText: string | null;
  isFinal: boolean;
  /** 話者ラベル。未指定時は "OTHER" を表示 */
  speakerLabel?: string;
  /**
   * IMPL-539: 直前の final セグメントとの連結を示すフラグ。
   * true の場合、ラベルを省略して視覚的に連続表示する (息継ぎによる分断緩和)。
   */
  connectedToPrevious?: boolean;
  /**
   * IMPL-539: 翻訳が precedingContext を利用して生成されたことを示す。
   * true の場合は翻訳行の左端に「文脈あり」アイコン (·) を付与する。
   */
  hasTranslationContext?: boolean;
}>;

/**
 * TranscriptPairItem molecule。
 *
 * 1 segment 分の「話者ラベル + 原文 (gray) + 翻訳 (white bold)」ペアを表示する。
 * MVP では話者ラベルは固定文字列 "OTHER" (自分以外の発話 = 翻訳対象の音声)。
 * partial 状態は italic + opacity 軽減で表示し、final 確定後は通常表示に戻る。
 *
 * 翻訳がまだ届いていない segment でも原文は即時表示する (partial の hot-path)。
 */
export function TranscriptPairItem(props: Props) {
  const label = props.speakerLabel ?? 'OTHER';
  const original = props.originalText ?? '';
  const translation = props.translatedText ?? '';
  const partial = props.isFinal ? 'false' : 'true';
  const connected = props.connectedToPrevious === true ? 'true' : 'false';
  const contextHint = props.hasTranslationContext === true ? 'true' : 'false';

  return (
    <div
      className="item"
      role="listitem"
      aria-label={label}
      data-connected={connected}
      data-context={contextHint}
    >
      {props.connectedToPrevious === true ? null : (
        <span className="label" data-variant="speaker">
          {label}
        </span>
      )}
      {original.length > 0 ? (
        <p className="original" data-partial={partial}>
          {original}
        </p>
      ) : null}
      {translation.length > 0 ? (
        <p className="translation" data-partial={partial} data-context={contextHint}>
          {props.hasTranslationContext === true ? (
            <span className="contextHint" aria-label="context from preceding segments">
              ·{' '}
            </span>
          ) : null}
          {translation}
        </p>
      ) : null}
    </div>
  );
}
