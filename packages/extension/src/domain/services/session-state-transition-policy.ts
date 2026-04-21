import { err, ok, type Result } from 'neverthrow';
import { type SessionState } from '../session/session-state';
import { type DomainError, sessionStateTransitionError } from '../shared/errors';

/**
 * ソースセッション状態遷移ポリシー (DD-241)。
 *
 * `SourceSession` 集約の状態遷移可否判定を集約から切り出した純粋関数群。
 * 状態遷移表は detailed-design.md §7.2 に準拠する。
 *
 * 特別扱い:
 * - `stopped` はいずれの状態からも到達可能 (terminal state)。テーブルには列挙しない
 * - `stopped` からはいかなる状態にも遷移できない
 * - `error` はテーブル上で遷移先なし (`stop` 操作でのみ `stopped` へ)
 */
export const ALLOWED_TRANSITIONS: Readonly<Record<SessionState, readonly SessionState[]>> = {
  idle: ['requesting_permission'],
  requesting_permission: ['connecting', 'error'],
  connecting: ['capturing', 'error'],
  capturing: ['transcribing', 'paused', 'reconnecting'],
  transcribing: ['translating', 'paused', 'reconnecting', 'degraded'],
  translating: ['transcribing', 'paused', 'reconnecting', 'degraded'],
  paused: ['capturing'],
  reconnecting: ['capturing', 'error'],
  degraded: ['transcribing'],
  error: [],
  stopped: [],
};

export const canTransitionSessionState = (from: SessionState, to: SessionState): boolean => {
  if (from === 'stopped') return false;
  if (to === 'stopped') return true;
  return ALLOWED_TRANSITIONS[from].includes(to);
};

export const validateSessionStateTransition = (
  from: SessionState,
  to: SessionState,
  reason: string,
): Result<void, DomainError> => {
  if (!canTransitionSessionState(from, to)) {
    return err(sessionStateTransitionError({ from, to, reason }));
  }
  return ok(undefined);
};
