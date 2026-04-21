import { type SessionState } from '../session/session-state.js';
import { type SourceSession } from '../session/source-session.js';

/**
 * 同時セッション数仕様 (DD-270)。
 *
 * 「同時にアクティブなソースは最大 3 まで」を判定する述語群。
 *
 * アクティブの定義: `stopped` 以外の状態 (`error` は `acknowledge → stopped`
 * で終了するまでリソースを保持するため稼働中として扱う)。
 *
 * Policy (`domain/services/session-concurrency-policy.ts`) との責務分担:
 * Specification = 純粋述語 (`boolean` を返す)、Policy = 違反時に
 * `DomainError` を組み立てる。Policy は本 spec を内部で利用する。
 */

export const MAX_CONCURRENT_ACTIVE_SESSIONS = 3 as const;

const TERMINAL_STATES: ReadonlySet<SessionState> = new Set(['stopped']);

export const isActiveSession = (session: SourceSession): boolean =>
  !TERMINAL_STATES.has(session.state);

export const countActiveSessions = (sessions: readonly SourceSession[]): number =>
  sessions.reduce((count, session) => (isActiveSession(session) ? count + 1 : count), 0);

/**
 * 新しいアクティブセッションを追加できる余地があるかを判定する述語。
 * 使用箇所: `StartSourceSessionUseCase` の事前条件 (use-case.md §10.1)。
 */
export const satisfiesConcurrentSessionLimit = (sessions: readonly SourceSession[]): boolean =>
  countActiveSessions(sessions) < MAX_CONCURRENT_ACTIVE_SESSIONS;
