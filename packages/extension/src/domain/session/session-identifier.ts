import { err, ok, type Result } from 'neverthrow';
import { ulid } from 'ulid';
import { z } from 'zod';
import { type DomainError, validationError } from '../shared/errors.js';

/**
 * ソースセッション集約 (DD-210) の自己識別子 (DD-230)。
 * ULID を Zod `.brand()` で branded type 化する。
 */
const sessionIdentifierSchema = z.string().ulid().brand<'SessionIdentifier'>();

export type SessionIdentifier = z.infer<typeof sessionIdentifierSchema>;

/**
 * 新規 `SessionIdentifier` を生成する。`ulid()` の契約上常に有効な ULID を返すため
 * 内部の `parse` は成功する。
 */
export const createSessionIdentifier = (): SessionIdentifier =>
  parseSessionIdentifier(ulid())._unsafeUnwrap();

export const parseSessionIdentifier = (value: unknown): Result<SessionIdentifier, DomainError> => {
  const result = sessionIdentifierSchema.safeParse(value);
  if (!result.success) {
    return err(
      validationError({
        field: 'SessionIdentifier',
        message: 'must be a ULID string',
      }),
    );
  }
  return ok(result.data);
};
