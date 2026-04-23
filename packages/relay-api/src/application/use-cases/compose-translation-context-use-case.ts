import { type PrecedingContext } from '../ports/translation-port';

/**
 * IMPL-404 ComposeTranslationContextUseCase (use-case.md §11.1)。
 *
 * WebSocket connection に紐づく per-session の直近確定字幕 (`finalTail`) から、
 * 翻訳プロバイダに添える `precedingContext` を構築する。
 *
 * - `maxSegments <= 0` は空配列を返す (context を使わない設定)
 * - `finalTail` は新しい方が末尾にある前提で、末尾から N 個を採用して
 *   「古い → 新しい」の順で返す
 * - `includeTranslatedText=false` の場合は `translatedText` フィールドを落とす
 *
 * ホットパス遵守のため永続 DB は参照しない。`finalTail` は relay-route 内の
 * インメモリ state として保持され、接続終了時に GC される。
 */
export type ComposeTranslationContextInput = Readonly<{
  finalTail: readonly PrecedingContext[];
  maxSegments: number;
  includeTranslatedText: boolean;
}>;

export type ComposeTranslationContextUseCase = (
  input: ComposeTranslationContextInput,
) => readonly PrecedingContext[];

export const createComposeTranslationContextUseCase =
  (): ComposeTranslationContextUseCase => (input) => {
    if (input.maxSegments <= 0 || input.finalTail.length === 0) return [];
    const tail =
      input.finalTail.length <= input.maxSegments
        ? input.finalTail
        : input.finalTail.slice(input.finalTail.length - input.maxSegments);
    if (input.includeTranslatedText) return tail;
    return tail.map(
      (entry): PrecedingContext => ({
        segmentId: entry.segmentId,
        sourceText: entry.sourceText,
        finalizedAt: entry.finalizedAt,
      }),
    );
  };
