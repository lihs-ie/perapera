import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import { type DomainError, validationError } from '../shared/errors.js';
import { parseSegmentIdentifier, type SegmentIdentifier } from './segment-identifier.js';
import {
  parseTranslationIdentifier,
  type TranslationIdentifier,
} from './translation-identifier.js';

/**
 * 翻訳セグメントエンティティ (DD-222)。
 *
 * 確定字幕 (`TranscriptSegment.isFinal === true`) にのみ紐づく (DD-211 / DD-271)。
 * status で discriminated union を構成し、`completed` は本文必須、`failed` は
 * 本文を持たない (API-spec: 失敗は session.error で通知、text は空扱い)。
 */
export type TranslationSegment =
  | Readonly<{
      translationIdentifier: TranslationIdentifier;
      segmentIdentifier: SegmentIdentifier;
      targetLanguage: string;
      status: 'completed';
      text: string;
    }>
  | Readonly<{
      translationIdentifier: TranslationIdentifier;
      segmentIdentifier: SegmentIdentifier;
      targetLanguage: string;
      status: 'failed';
    }>;

const bcp47Schema = z.string().regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/);

const validateTargetLanguage = (value: string): Result<string, DomainError> => {
  const result = bcp47Schema.safeParse(value);
  if (!result.success) {
    return err(
      validationError({
        field: 'TranslationSegment.targetLanguage',
        message: 'must be a BCP-47 tag',
      }),
    );
  }
  return ok(result.data);
};

const validateText = (text: string): Result<string, DomainError> => {
  if (text.length === 0) {
    return err(validationError({ field: 'TranslationSegment.text', message: 'must not be empty' }));
  }
  return ok(text);
};

export const createCompletedTranslationSegment = (params: {
  translationIdentifier: string;
  segmentIdentifier: string;
  targetLanguage: string;
  text: string;
}): Result<TranslationSegment, DomainError> =>
  parseTranslationIdentifier(params.translationIdentifier).andThen((translationIdentifier) =>
    parseSegmentIdentifier(params.segmentIdentifier).andThen((segmentIdentifier) =>
      validateTargetLanguage(params.targetLanguage).andThen((targetLanguage) =>
        validateText(params.text).map((text) => ({
          translationIdentifier,
          segmentIdentifier,
          targetLanguage,
          status: 'completed' as const,
          text,
        })),
      ),
    ),
  );

export const createFailedTranslationSegment = (params: {
  translationIdentifier: string;
  segmentIdentifier: string;
  targetLanguage: string;
}): Result<TranslationSegment, DomainError> =>
  parseTranslationIdentifier(params.translationIdentifier).andThen((translationIdentifier) =>
    parseSegmentIdentifier(params.segmentIdentifier).andThen((segmentIdentifier) =>
      validateTargetLanguage(params.targetLanguage).map((targetLanguage) => ({
        translationIdentifier,
        segmentIdentifier,
        targetLanguage,
        status: 'failed' as const,
      })),
    ),
  );
