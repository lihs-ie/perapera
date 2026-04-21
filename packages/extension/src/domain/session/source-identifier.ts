import { err, ok, type Result } from 'neverthrow';
import { ulid } from 'ulid';
import { z } from 'zod';
import { type DomainError, validationError } from '../shared/errors.js';

/**
 * 音声ソース (`AudioSource`) の識別子 (DD-231)。
 * `SourceSession` は `sourceIdentifier` フィールドでこれを保持し、1 セッションが
 * 複数の sourceIdentifier を持つことはない (DD-210 不変条件)。
 */
const sourceIdentifierSchema = z.string().ulid().brand<'SourceIdentifier'>();

export type SourceIdentifier = z.infer<typeof sourceIdentifierSchema>;

export const createSourceIdentifier = (): SourceIdentifier =>
  parseSourceIdentifier(ulid())._unsafeUnwrap();

export const parseSourceIdentifier = (value: unknown): Result<SourceIdentifier, DomainError> => {
  const result = sourceIdentifierSchema.safeParse(value);
  if (!result.success) {
    return err(
      validationError({
        field: 'SourceIdentifier',
        message: 'must be a ULID string',
      }),
    );
  }
  return ok(result.data);
};
