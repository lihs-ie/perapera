import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import { type DomainError, validationError } from '../shared/errors.js';

/**
 * `SourceSession` 集約の状態値 (DD-233 / DD-210)。
 * 設計文書: detailed-design.md §7.1 状態遷移図、domain.md §4.3.1 不変条件。
 * 値は設計文書に合わせ snake_case を保持する (システム間の契約のため)。
 */
export const SESSION_STATES = [
  'idle',
  'requesting_permission',
  'connecting',
  'capturing',
  'transcribing',
  'translating',
  'paused',
  'reconnecting',
  'degraded',
  'stopped',
  'error',
] as const;

const sessionStateSchema = z.enum(SESSION_STATES);

export type SessionState = z.infer<typeof sessionStateSchema>;

export const parseSessionState = (value: unknown): Result<SessionState, DomainError> => {
  const result = sessionStateSchema.safeParse(value);
  if (!result.success) {
    return err(
      validationError({
        field: 'SessionState',
        message: `expected one of [${SESSION_STATES.join(', ')}]`,
      }),
    );
  }
  return ok(result.data);
};
