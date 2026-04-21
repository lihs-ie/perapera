import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import { type DomainError, validationError } from '../shared/errors';

/**
 * Relay Session の識別子 (SessionIdentifier)。
 *
 * - ULID 形式 (ULID spec) を採用。小文字 / 大文字両方許容し、拡張側との
 *   相互運用性を確保 (拡張も ULID).
 * - `brand<'RelaySessionIdentifier'>()` で nominal typing (`as` 禁止下で
 *   識別子の入れ違いを防ぐ)
 */
const sessionIdentifierSchema = z
  .string()
  .regex(/^[0-9A-HJKMNP-TV-Z]{26}$/i, 'must be a ULID')
  .brand<'RelaySessionIdentifier'>();

export type SessionIdentifier = z.infer<typeof sessionIdentifierSchema>;

export const parseSessionIdentifier = (value: unknown): Result<SessionIdentifier, DomainError> => {
  const result = sessionIdentifierSchema.safeParse(value);
  if (!result.success) {
    return err(
      validationError({
        field: 'SessionIdentifier',
        message: 'must be a ULID (26 crockford base32 chars)',
      }),
    );
  }
  return ok(result.data);
};
