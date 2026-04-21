import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import {
  canTransitionSessionState,
  validateSessionStateTransition,
} from '../services/session-state-transition-policy';
import { type DomainError, sessionStateTransitionError, validationError } from '../shared/errors';
import { type LanguagePair } from './language-pair';
import { parseSessionIdentifier, type SessionIdentifier } from './session-identifier';
import { type SessionState } from './session-state';
import { parseSourceIdentifier, type SourceIdentifier } from './source-identifier';
import { parseSourceType, type SourceType } from './source-type';

/**
 * ソースセッション集約ルート (DD-210 / DD-220)。
 *
 * 不変条件:
 * 1. `sessionIdentifier` と `sourceIdentifier` の組は生成後不変
 * 2. 状態遷移は §7 の state machine に従う (idle → requesting_permission → ...)
 * 3. `degraded` は翻訳障害時のみ遷移可能 (transcribing / translating から)
 * 4. `stopped` 後は再開不可 (terminal state)
 *
 * 状態遷移表は `domain/services/session-state-transition-policy.ts` (DD-241) に集約する。
 */
export type SourceSession = Readonly<{
  sessionIdentifier: SessionIdentifier;
  sourceIdentifier: SourceIdentifier;
  sourceType: SourceType;
  state: SessionState;
  languagePair: LanguagePair;
  startedAt: string;
  stoppedAt: string | null;
  degradedReason: string | null;
}>;

const iso8601Schema = z.string().datetime();

type TransitionContext = Readonly<{
  degradedReason?: string;
  stoppedAt?: string;
}>;

const transitionGuard = (
  current: SourceSession,
  to: SessionState,
  reason: string,
): Result<SourceSession, DomainError> =>
  validateSessionStateTransition(current.state, to, reason).map(() => ({
    ...current,
    state: to,
    degradedReason: null,
  }));

export const createSourceSession = (params: {
  sessionIdentifier: string;
  sourceIdentifier: string;
  sourceType: string;
  languagePair: LanguagePair;
  startedAt: string;
}): Result<SourceSession, DomainError> => {
  const startedAtResult = iso8601Schema.safeParse(params.startedAt);
  if (!startedAtResult.success) {
    return err(
      validationError({
        field: 'SourceSession.startedAt',
        message: 'must be ISO 8601 datetime',
      }),
    );
  }
  return parseSessionIdentifier(params.sessionIdentifier).andThen((sessionIdentifier) =>
    parseSourceIdentifier(params.sourceIdentifier).andThen((sourceIdentifier) =>
      parseSourceType(params.sourceType).map(
        (sourceType): SourceSession => ({
          sessionIdentifier,
          sourceIdentifier,
          sourceType,
          state: 'idle',
          languagePair: params.languagePair,
          startedAt: startedAtResult.data,
          stoppedAt: null,
          degradedReason: null,
        }),
      ),
    ),
  );
};

export const startSourceSession = (session: SourceSession): Result<SourceSession, DomainError> =>
  transitionGuard(session, 'requesting_permission', 'start only allowed from idle');

/**
 * 汎用状態遷移。外部 (Relay イベント / Permission 結果 / Capture 成否) から
 * 呼ばれる。`degraded` / `stopped` への遷移は専用ヘルパーを使うこと
 * (理由・タイムスタンプの記録があるため)。
 */
export const transitionSourceSessionState = (
  session: SourceSession,
  target: SessionState,
): Result<SourceSession, DomainError> => {
  if (target === 'degraded' || target === 'stopped') {
    return err(
      sessionStateTransitionError({
        from: session.state,
        to: target,
        reason: 'use dedicated helper (markSourceSessionDegraded / stopSourceSession)',
      }),
    );
  }
  return transitionGuard(
    session,
    target,
    `direct transition ${session.state} → ${target} is not allowed`,
  );
};

export const pauseSourceSession = (session: SourceSession): Result<SourceSession, DomainError> =>
  transitionGuard(session, 'paused', 'pause only allowed from active states');

export const resumeSourceSession = (session: SourceSession): Result<SourceSession, DomainError> =>
  transitionGuard(session, 'capturing', 'resume only allowed from paused');

export const markSourceSessionDegraded = (
  session: SourceSession,
  reason: string,
): Result<SourceSession, DomainError> => {
  if (!canTransitionSessionState(session.state, 'degraded')) {
    return err(
      sessionStateTransitionError({
        from: session.state,
        to: 'degraded',
        reason: 'degraded is only reachable from transcribing / translating',
      }),
    );
  }
  return ok({ ...session, state: 'degraded', degradedReason: reason });
};

export const recoverSourceSessionTranslation = (
  session: SourceSession,
): Result<SourceSession, DomainError> => {
  if (session.state !== 'degraded') {
    return err(
      sessionStateTransitionError({
        from: session.state,
        to: 'transcribing',
        reason: 'recover only allowed from degraded',
      }),
    );
  }
  return ok({ ...session, state: 'transcribing', degradedReason: null });
};

export const stopSourceSession = (
  session: SourceSession,
  context: TransitionContext & { stoppedAt: string },
): Result<SourceSession, DomainError> => {
  if (!canTransitionSessionState(session.state, 'stopped')) {
    return err(
      sessionStateTransitionError({
        from: session.state,
        to: 'stopped',
        reason: `cannot stop from ${session.state}`,
      }),
    );
  }
  const stoppedAtResult = iso8601Schema.safeParse(context.stoppedAt);
  if (!stoppedAtResult.success) {
    return err(
      validationError({
        field: 'SourceSession.stoppedAt',
        message: 'must be ISO 8601 datetime',
      }),
    );
  }
  return ok({
    ...session,
    state: 'stopped',
    stoppedAt: stoppedAtResult.data,
    degradedReason: null,
  });
};
