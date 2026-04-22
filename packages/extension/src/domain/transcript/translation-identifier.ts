import { err, ok, type Result } from 'neverthrow';
import { ulid } from 'ulidx';
import { z } from 'zod';
import { type DomainError, validationError } from '../shared/errors';

/**
 * 翻訳セグメントの識別子 (DD-222)。
 * 原文セグメント (`SegmentIdentifier`) に 1 対 1 で紐づく (DD-211 / DD-271)。
 */
const translationIdentifierSchema = z.string().ulid().brand<'TranslationIdentifier'>();

export type TranslationIdentifier = z.infer<typeof translationIdentifierSchema>;

export const createTranslationIdentifier = (): TranslationIdentifier =>
  parseTranslationIdentifier(ulid())._unsafeUnwrap();

export const parseTranslationIdentifier = (
  value: unknown,
): Result<TranslationIdentifier, DomainError> => {
  const result = translationIdentifierSchema.safeParse(value);
  if (!result.success) {
    return err(
      validationError({
        field: 'TranslationIdentifier',
        message: 'must be a ULID string',
      }),
    );
  }
  return ok(result.data);
};
