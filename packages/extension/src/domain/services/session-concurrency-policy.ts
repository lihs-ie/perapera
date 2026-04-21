import { err, ok, type Result } from 'neverthrow';
import { type SourceSession } from '../session/source-session.js';
import { type SessionState } from '../session/session-state.js';
import { type DomainError, invariantViolationError } from '../shared/errors.js';

/**
 * セッション並行度ポリシー (DD-240)。
 *
 * 設計文書: domain.md DD-240, DD-270 (ConcurrentSessionLimitSpecification)。
 * `SourceSession` が同時にアクティブに保持できる数の上限 (3) を保証する。
 *
 * アクティブ = `stopped` 以外の状態。`error` も「acknowledge() → stopped」で
 * 終了させるまではリソースを保持しているため稼働中として扱う。
 *
 * IMPL-150 `ConcurrentSessionLimitSpecification` 実装時に、`isActiveSession` /
 * `countActiveSessions` を述語 spec へ移動し、本ポリシーはそれを利用する形に
 * リファクタされる予定。
 */
export const MAX_CONCURRENT_ACTIVE_SESSIONS = 3 as const;

const TERMINAL_STATES: ReadonlySet<SessionState> = new Set(['stopped']);

export const isActiveSession = (session: SourceSession): boolean =>
  !TERMINAL_STATES.has(session.state);

export const countActiveSessions = (sessions: readonly SourceSession[]): number =>
  sessions.reduce((count, session) => (isActiveSession(session) ? count + 1 : count), 0);

/**
 * セッション追加前の事前条件チェック。既存アクティブ数が上限未満なら OK。
 * use-case.md §10.1 `StartSourceSessionUseCase` のシーケンスで
 * `Policy.validate()` として呼ばれる想定。
 */
export const validateSessionConcurrency = (
  existingSessions: readonly SourceSession[],
): Result<void, DomainError> => {
  const activeCount = countActiveSessions(existingSessions);
  if (activeCount >= MAX_CONCURRENT_ACTIVE_SESSIONS) {
    return err(
      invariantViolationError({
        invariant: 'concurrent-session-limit',
        details: `active session count ${String(activeCount)} would exceed limit ${String(MAX_CONCURRENT_ACTIVE_SESSIONS)}`,
      }),
    );
  }
  return ok(undefined);
};
