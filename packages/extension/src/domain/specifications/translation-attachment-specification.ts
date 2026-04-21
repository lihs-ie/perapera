import { type SegmentIdentifier } from '../transcript/segment-identifier';
import { type TranscriptStream } from '../transcript/transcript-stream';

/**
 * 翻訳紐付け仕様 (DD-271)。
 *
 * 「翻訳は確定字幕にのみ紐づけ可能」を判定する述語。`TranscriptStream` 内の
 * 指定 segment が finalized (`isFinal === true`) であるかを確認する。
 *
 * Policy / aggregate との責務分担: 本 spec は `boolean` を返す。
 * 違反時の `DomainError` 組み立ては `transcript-stream.ts` の
 * `attachTranslationToSegment` が担う (invariantViolationError 生成)。
 */
export const canAttachTranslation = (
  stream: TranscriptStream,
  segmentIdentifier: SegmentIdentifier,
): boolean => {
  const segment = stream.segments.get(segmentIdentifier);
  if (segment === undefined) return false;
  return segment.isFinal;
};
