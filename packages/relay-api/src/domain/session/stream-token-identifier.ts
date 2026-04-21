import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import { type DomainError, validationError } from '../shared/errors';

/**
 * WebSocket 接続用の短命トークン識別子 (StreamTokenIdentifier)。
 *
 * - `strm_` プレフィクス + ULID 形式 (api-specification §4.2)
 * - 実際の JWT 文字列とは別に、jti 相当の識別子として使用する
 * - `brand<'StreamTokenIdentifier'>()` で nominal typing
 */
const streamTokenIdentifierSchema = z
  .string()
  .regex(/^strm_[0-9A-HJKMNP-TV-Z]{26}$/i, 'must be in the form strm_<ULID>')
  .brand<'StreamTokenIdentifier'>();

export type StreamTokenIdentifier = z.infer<typeof streamTokenIdentifierSchema>;

export const parseStreamTokenIdentifier = (
  value: unknown,
): Result<StreamTokenIdentifier, DomainError> => {
  const result = streamTokenIdentifierSchema.safeParse(value);
  if (!result.success) {
    return err(
      validationError({
        field: 'StreamTokenIdentifier',
        message: 'must be in the form strm_<ULID>',
      }),
    );
  }
  return ok(result.data);
};
