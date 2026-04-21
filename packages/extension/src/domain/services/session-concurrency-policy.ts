import { err, ok, type Result } from 'neverthrow';
import { type SourceSession } from '../session/source-session';
import { type DomainError, invariantViolationError } from '../shared/errors';
import {
  MAX_CONCURRENT_ACTIVE_SESSIONS,
  countActiveSessions,
  satisfiesConcurrentSessionLimit,
} from '../specifications/concurrent-session-limit-specification';

/**
 * セッション並行度ポリシー (DD-240)。
 *
 * Specification (DD-270, `domain/specifications/concurrent-session-limit-specification.ts`)
 * を利用して不変条件を検証し、違反時に `DomainError` を組み立てる責務を持つ。
 *
 * 使用箇所: `StartSourceSessionUseCase` の事前条件チェック
 * (use-case.md §10.1 `Policy.validate()`)。
 *
 * 責務分担:
 * - Specification = 純粋述語 (`satisfiesConcurrentSessionLimit` 等)
 * - Policy = 違反時に `invariantViolationError` を組み立てる本モジュール
 */
export const validateSessionConcurrency = (
  existingSessions: readonly SourceSession[],
): Result<void, DomainError> => {
  if (satisfiesConcurrentSessionLimit(existingSessions)) {
    return ok(undefined);
  }
  const activeCount = countActiveSessions(existingSessions);
  return err(
    invariantViolationError({
      invariant: 'concurrent-session-limit',
      details: `active session count ${String(activeCount)} would exceed limit ${String(MAX_CONCURRENT_ACTIVE_SESSIONS)}`,
    }),
  );
};
