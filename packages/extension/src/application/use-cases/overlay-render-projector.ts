import { type OverlaySettings } from '../../domain/profile/overlay-settings';
import { type TranscriptStream } from '../../domain/transcript/transcript-stream';
import { type OverlayLine, type OverlayRenderModel } from '../ports/overlay-presenter';

/**
 * TranscriptStream を OverlayRenderModel に投影するユーティリティ。
 *
 * IMPL-211 / IMPL-213 / IMPL-214 の UseCase から共通利用される。
 *
 * 仕様:
 * - segment を `timeRange.startMs` 昇順にソート
 * - `settings.maxLines` で末尾 N 件に絞る (最新 N 件を保持)
 * - `showOriginalText=false` の場合 `originalText` は `null`
 * - `showTranslatedText=false` の場合 `translatedText` / `targetLanguage` は `null`
 * - 翻訳は `status === 'completed'` のみ採用 (failed/未到着は `translatedText=null`)
 * - `originalText` と `translatedText` の両方が `null` になる行は除外 (表示内容なし)
 */
export const projectOverlayRenderModel = (params: {
  stream: TranscriptStream;
  settings: OverlaySettings;
}): OverlayRenderModel => {
  const { stream, settings } = params;
  const sortedSegments = [...stream.segments.values()].sort(
    (a, b) => a.timeRange.startMs - b.timeRange.startMs,
  );
  const capped = sortedSegments.slice(-settings.maxLines);

  const lines: OverlayLine[] = [];
  // IMPL-539: overlay 連結表示のため、時系列で直前に並ぶ final segment の
  // `segmentIdentifier` を `precedingSegmentIdentifier` に入れる (暫定ヒューリスティック)。
  // 精密には Relay が `transcript.final.precedingSegmentId` を送って UseCase が
  // 保持するのが理想だが、現行 TranscriptSegment 集約には persist しないため、
  // projector 内で末尾の final を参照する形で代替する。partial は null。
  let lastFinalIdentifier: OverlayLine['segmentIdentifier'] | null = null;
  for (const segment of capped) {
    const originalText = settings.showOriginalText ? segment.text : null;
    let translatedText: string | null = null;
    let targetLanguage: string | null = null;
    if (settings.showTranslatedText) {
      const translation = stream.translations.get(segment.segmentIdentifier);
      if (translation?.status === 'completed') {
        translatedText = translation.text;
        targetLanguage = translation.targetLanguage;
      }
    }
    if (originalText === null && translatedText === null) {
      if (segment.isFinal) lastFinalIdentifier = segment.segmentIdentifier;
      continue;
    }
    const precedingSegmentIdentifier = segment.isFinal ? lastFinalIdentifier : null;
    lines.push({
      segmentIdentifier: segment.segmentIdentifier,
      originalText,
      translatedText,
      targetLanguage,
      isFinal: segment.isFinal,
      precedingSegmentIdentifier,
      // TranslationSegment は contextSegmentIds を保持しない (追加せずに済ませるため)
      // 将来的に Relay からの `translation.final.contextSegmentIds` をドメインに載せた
      // 時点で true にする余地を残す。現状は常に false。
      hasTranslationContext: false,
    });
    if (segment.isFinal) lastFinalIdentifier = segment.segmentIdentifier;
  }

  return {
    sessionIdentifier: stream.sessionIdentifier,
    lines,
  };
};
