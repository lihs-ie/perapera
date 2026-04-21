import { err, ok, type Result } from 'neverthrow';
import { ulid } from 'ulid';
import { z } from 'zod';
import { type DomainError, validationError } from '../shared/errors.js';

/**
 * 拡張プロファイル集約 (`ExtensionProfile`, DD-212) の識別子。
 */
const profileIdentifierSchema = z.string().ulid().brand<'ProfileIdentifier'>();

export type ProfileIdentifier = z.infer<typeof profileIdentifierSchema>;

export const createProfileIdentifier = (): ProfileIdentifier =>
  parseProfileIdentifier(ulid())._unsafeUnwrap();

export const parseProfileIdentifier = (value: unknown): Result<ProfileIdentifier, DomainError> => {
  const result = profileIdentifierSchema.safeParse(value);
  if (!result.success) {
    return err(
      validationError({
        field: 'ProfileIdentifier',
        message: 'must be a ULID string',
      }),
    );
  }
  return ok(result.data);
};
