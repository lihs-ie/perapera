export type Props = Readonly<{
  originalText: string | null;
  translatedText: string | null;
  isFinal: boolean;
  /** 話者ラベル。未指定時は "OTHER" を表示 */
  speakerLabel?: string;
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

  return (
    <div className="item" role="listitem" aria-label={label}>
      <span className="label" data-variant="speaker">
        {label}
      </span>
      {original.length > 0 ? (
        <p className="original" data-partial={partial}>
          {original}
        </p>
      ) : null}
      {translation.length > 0 ? (
        <p className="translation" data-partial={partial}>
          {translation}
        </p>
      ) : null}
    </div>
  );
}
