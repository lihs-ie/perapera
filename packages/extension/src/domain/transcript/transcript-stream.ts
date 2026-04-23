import { err, type Result } from 'neverthrow';
import { parseSessionIdentifier, type SessionIdentifier } from '../session/session-identifier';
import { type DomainError, invariantViolationError, notFoundError } from '../shared/errors';
import { parseSegmentIdentifier } from './segment-identifier';
import type { TimestampRange } from './timestamp-range';
import {
  createPartialTranscriptSegment,
  finalizeTranscriptSegment,
  updatePartialTranscriptSegment,
  type TranscriptSegment,
} from './transcript-segment';
import { createCompletedTranslationSegment, type TranslationSegment } from './translation-segment';

/**
 * 字幕ストリーム集約ルート (DD-211)。
 * 1 セッションに対して 1 本の字幕ストリームを束ね、segmentIdentifier ごとに
 * `TranscriptSegment` と 0/1 の `TranslationSegment` を保持する。
 *
 * 不変条件:
 * - 同一 `segmentIdentifier` の確定字幕は 1 回のみ (再 finalize 禁止)
 * - `TranslationSegment` は確定済み字幕にのみ紐づく (DD-271)
 * - 部分字幕 `revision` は同一 segment 内で単調増加
 *
 * データ構造は `Map<string, TranscriptSegment>` / `Map<string, TranslationSegment>`
 * を Readonly でラップする (ドメイン層での immutability)。
 */
export type TranscriptStream = Readonly<{
  sessionIdentifier: SessionIdentifier;
  segments: ReadonlyMap<string, TranscriptSegment>;
  translations: ReadonlyMap<string, TranslationSegment>;
}>;

export const createTranscriptStream = (params: {
  sessionIdentifier: string;
}): Result<TranscriptStream, DomainError> =>
  parseSessionIdentifier(params.sessionIdentifier).map((sessionIdentifier) => ({
    sessionIdentifier,
    segments: new Map(),
    translations: new Map(),
  }));

const withSegment = (stream: TranscriptStream, segment: TranscriptSegment): TranscriptStream => {
  const nextSegments = new Map(stream.segments);
  nextSegments.set(segment.segmentIdentifier, segment);
  return { ...stream, segments: nextSegments };
};

const withTranslation = (
  stream: TranscriptStream,
  translation: TranslationSegment,
): TranscriptStream => {
  const nextTranslations = new Map(stream.translations);
  nextTranslations.set(translation.segmentIdentifier, translation);
  return { ...stream, translations: nextTranslations };
};

export const getSegment = (
  stream: TranscriptStream,
  segmentIdentifier: string,
): TranscriptSegment | undefined => stream.segments.get(segmentIdentifier);

export const getTranslation = (
  stream: TranscriptStream,
  segmentIdentifier: string,
): TranslationSegment | undefined => stream.translations.get(segmentIdentifier);

export const appendPartialTranscriptSegment = (
  stream: TranscriptStream,
  params: {
    segmentIdentifier: string;
    revision: number;
    text: string;
    timeRange: TimestampRange;
  },
): Result<TranscriptStream, DomainError> => {
  const existing = stream.segments.get(params.segmentIdentifier);
  if (existing === undefined) {
    return createPartialTranscriptSegment(params).map((segment) => withSegment(stream, segment));
  }
  return updatePartialTranscriptSegment(existing, {
    revision: params.revision,
    text: params.text,
    timeRange: params.timeRange,
  }).map((segment) => withSegment(stream, segment));
};

export const finalizeSegment = (
  stream: TranscriptStream,
  params: { segmentIdentifier: string; text?: string; timeRange?: TimestampRange },
): Result<TranscriptStream, DomainError> => {
  const override: { text?: string; timeRange?: TimestampRange } = {};
  if (params.text !== undefined) override.text = params.text;
  if (params.timeRange !== undefined) override.timeRange = params.timeRange;

  const existing = stream.segments.get(params.segmentIdentifier);
  if (existing === undefined) {
    if (params.text === undefined || params.timeRange === undefined) {
      return err(
        invariantViolationError({
          invariant: 'finalize-without-partial-requires-full-payload',
          details: `segment ${params.segmentIdentifier} has no prior partial; text and timeRange are required`,
        }),
      );
    }
    return createPartialTranscriptSegment({
      segmentIdentifier: params.segmentIdentifier,
      revision: 1,
      text: params.text,
      timeRange: params.timeRange,
    })
      .andThen((partial) => finalizeTranscriptSegment(partial, override))
      .map((final) => withSegment(stream, final));
  }
  return finalizeTranscriptSegment(existing, override).map((segment) =>
    withSegment(stream, segment),
  );
};

/**
 * 直近 `maxSegments` 個の確定 (isFinal=true) 字幕を、挿入順で返す (DD-211 不変条件 4)。
 *
 * 目的: `HandleTranscriptFinalUseCase` が翻訳発火前に `precedingContext` を
 * 組み立てる際、ホットパス上でメモリから直接取得するためのクエリ。永続層 (IndexedDB)
 * を参照しない。
 *
 * - `maxSegments <= 0` の場合は空配列を返す (翻訳に context を渡さない設定)
 * - 末尾 N 個を返す (最も新しい final が最後)。呼び出し側が逆順にしたい場合は
 *   `.reverse()` する
 * - translation が紐づいていない final も含む (context 用には original text のみで十分、
 *   訳文は呼び出し側で `getTranslation` と組み合わせる)
 */
export const recentFinalTail = (
  stream: TranscriptStream,
  maxSegments: number,
): readonly TranscriptSegment[] => {
  if (maxSegments <= 0) return [];
  const finals: TranscriptSegment[] = [];
  for (const segment of stream.segments.values()) {
    if (segment.isFinal) finals.push(segment);
  }
  if (finals.length <= maxSegments) return finals;
  return finals.slice(finals.length - maxSegments);
};

export const attachTranslationToSegment = (
  stream: TranscriptStream,
  params: {
    translationIdentifier: string;
    segmentIdentifier: string;
    targetLanguage: string;
    text: string;
  },
): Result<TranscriptStream, DomainError> =>
  parseSegmentIdentifier(params.segmentIdentifier).andThen((segmentIdentifier) => {
    const segment = stream.segments.get(segmentIdentifier);
    if (segment === undefined) {
      return err(
        notFoundError({
          resourceType: 'TranscriptSegment',
          identifier: segmentIdentifier,
        }),
      );
    }
    if (!segment.isFinal) {
      return err(
        invariantViolationError({
          invariant: 'translation-requires-final-segment',
          details: `segment ${segmentIdentifier} is not finalized`,
        }),
      );
    }
    return createCompletedTranslationSegment({
      translationIdentifier: params.translationIdentifier,
      segmentIdentifier,
      targetLanguage: params.targetLanguage,
      text: params.text,
    }).map((translation) => withTranslation(stream, translation));
  });
