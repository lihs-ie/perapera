import { describe, expect, it } from 'vitest';
import { createLanguagePair } from '../session/language-pair.js';
import {
  createSourceSession,
  markSourceSessionDegraded,
  pauseSourceSession,
  startSourceSession,
  stopSourceSession,
  transitionSourceSessionState,
  type SourceSession,
} from '../session/source-session.js';
import { SESSION_STATES, type SessionState } from '../session/session-state.js';
import {
  MAX_CONCURRENT_ACTIVE_SESSIONS,
  countActiveSessions,
  isActiveSession,
  validateSessionConcurrency,
} from './session-concurrency-policy.js';

const SESSION_IDS = [
  '01HZX8Y1R8M7D3Q2P4T5V6W7A1',
  '01HZX8Y1R8M7D3Q2P4T5V6W7A2',
  '01HZX8Y1R8M7D3Q2P4T5V6W7A3',
  '01HZX8Y1R8M7D3Q2P4T5V6W7A4',
  '01HZX8Y1R8M7D3Q2P4T5V6W7A5',
] as const;

const SOURCE_IDS = [
  '01HZX8Y1R8M7D3Q2P4T5V6W7B1',
  '01HZX8Y1R8M7D3Q2P4T5V6W7B2',
  '01HZX8Y1R8M7D3Q2P4T5V6W7B3',
  '01HZX8Y1R8M7D3Q2P4T5V6W7B4',
  '01HZX8Y1R8M7D3Q2P4T5V6W7B5',
] as const;

const languagePair = createLanguagePair({ source: 'en-US', target: 'ja-JP' })._unsafeUnwrap();
const startedAt = '2026-04-21T00:00:00.000Z';
const stoppedAt = '2026-04-21T00:05:00.000Z';

const makeSession = (index: number): SourceSession =>
  createSourceSession({
    sessionIdentifier: SESSION_IDS[index]!,
    sourceIdentifier: SOURCE_IDS[index]!,
    sourceType: 'tab',
    languagePair,
    startedAt,
  })._unsafeUnwrap();

const withState = (index: number, targetState: SessionState): SourceSession => {
  let session = makeSession(index);
  switch (targetState) {
    case 'idle':
      return session;
    case 'requesting_permission':
      return startSourceSession(session)._unsafeUnwrap();
    case 'connecting':
      session = startSourceSession(session)._unsafeUnwrap();
      return transitionSourceSessionState(session, 'connecting')._unsafeUnwrap();
    case 'capturing':
      session = startSourceSession(session)._unsafeUnwrap();
      session = transitionSourceSessionState(session, 'connecting')._unsafeUnwrap();
      return transitionSourceSessionState(session, 'capturing')._unsafeUnwrap();
    case 'transcribing':
      session = startSourceSession(session)._unsafeUnwrap();
      session = transitionSourceSessionState(session, 'connecting')._unsafeUnwrap();
      session = transitionSourceSessionState(session, 'capturing')._unsafeUnwrap();
      return transitionSourceSessionState(session, 'transcribing')._unsafeUnwrap();
    case 'translating':
      session = startSourceSession(session)._unsafeUnwrap();
      session = transitionSourceSessionState(session, 'connecting')._unsafeUnwrap();
      session = transitionSourceSessionState(session, 'capturing')._unsafeUnwrap();
      session = transitionSourceSessionState(session, 'transcribing')._unsafeUnwrap();
      return transitionSourceSessionState(session, 'translating')._unsafeUnwrap();
    case 'paused':
      session = startSourceSession(session)._unsafeUnwrap();
      session = transitionSourceSessionState(session, 'connecting')._unsafeUnwrap();
      session = transitionSourceSessionState(session, 'capturing')._unsafeUnwrap();
      return pauseSourceSession(session)._unsafeUnwrap();
    case 'reconnecting':
      session = startSourceSession(session)._unsafeUnwrap();
      session = transitionSourceSessionState(session, 'connecting')._unsafeUnwrap();
      session = transitionSourceSessionState(session, 'capturing')._unsafeUnwrap();
      return transitionSourceSessionState(session, 'reconnecting')._unsafeUnwrap();
    case 'degraded':
      session = startSourceSession(session)._unsafeUnwrap();
      session = transitionSourceSessionState(session, 'connecting')._unsafeUnwrap();
      session = transitionSourceSessionState(session, 'capturing')._unsafeUnwrap();
      session = transitionSourceSessionState(session, 'transcribing')._unsafeUnwrap();
      return markSourceSessionDegraded(session, 'test-degraded')._unsafeUnwrap();
    case 'error':
      session = startSourceSession(session)._unsafeUnwrap();
      return transitionSourceSessionState(session, 'error')._unsafeUnwrap();
    case 'stopped':
      session = startSourceSession(session)._unsafeUnwrap();
      return stopSourceSession(session, { stoppedAt })._unsafeUnwrap();
  }
};

describe('SessionConcurrencyPolicy (DD-240)', () => {
  it('exposes MAX_CONCURRENT_ACTIVE_SESSIONS = 3 (DD-270)', () => {
    expect(MAX_CONCURRENT_ACTIVE_SESSIONS).toBe(3);
  });

  describe('isActiveSession', () => {
    const ACTIVE: readonly SessionState[] = [
      'idle',
      'requesting_permission',
      'connecting',
      'capturing',
      'transcribing',
      'translating',
      'paused',
      'reconnecting',
      'degraded',
      'error',
    ];
    const TERMINAL: readonly SessionState[] = ['stopped'];

    it.each(ACTIVE)('treats %s as active', (state) => {
      const session = withState(0, state);
      expect(isActiveSession(session)).toBe(true);
    });

    it.each(TERMINAL)('treats %s as non-active (terminal)', (state) => {
      const session = withState(0, state);
      expect(isActiveSession(session)).toBe(false);
    });

    it('covers all 11 SessionState variants in the categorization', () => {
      // 念のため全状態を ACTIVE ∪ TERMINAL で覆い尽くしているか確認
      const covered = new Set<SessionState>([...ACTIVE, ...TERMINAL]);
      for (const state of SESSION_STATES) {
        expect(covered.has(state)).toBe(true);
      }
    });
  });

  describe('countActiveSessions', () => {
    it('returns 0 for empty input', () => {
      expect(countActiveSessions([])).toBe(0);
    });

    it('counts only active sessions, ignoring stopped ones', () => {
      const sessions: readonly SourceSession[] = [
        withState(0, 'capturing'),
        withState(1, 'stopped'),
        withState(2, 'transcribing'),
      ];
      expect(countActiveSessions(sessions)).toBe(2);
    });

    it('returns 0 when all sessions are stopped', () => {
      const sessions: readonly SourceSession[] = [withState(0, 'stopped'), withState(1, 'stopped')];
      expect(countActiveSessions(sessions)).toBe(0);
    });
  });

  describe('validateSessionConcurrency', () => {
    it('returns ok for empty active session list', () => {
      const result = validateSessionConcurrency([]);
      expect(result.isOk()).toBe(true);
    });

    it('returns ok when active count is 1', () => {
      const result = validateSessionConcurrency([withState(0, 'capturing')]);
      expect(result.isOk()).toBe(true);
    });

    it('returns ok when active count is 2 (below limit)', () => {
      const result = validateSessionConcurrency([
        withState(0, 'capturing'),
        withState(1, 'transcribing'),
      ]);
      expect(result.isOk()).toBe(true);
    });

    it('returns err with invariant-violation when active count reaches the limit', () => {
      const result = validateSessionConcurrency([
        withState(0, 'capturing'),
        withState(1, 'transcribing'),
        withState(2, 'translating'),
      ]);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.kind).toBe('invariant-violation');
        if (result.error.kind === 'invariant-violation') {
          expect(result.error.invariant).toBe('concurrent-session-limit');
          expect(result.error.details).toContain('3');
        }
      }
    });

    it('returns err when active count exceeds the limit', () => {
      const result = validateSessionConcurrency([
        withState(0, 'capturing'),
        withState(1, 'transcribing'),
        withState(2, 'translating'),
        withState(3, 'paused'),
      ]);
      expect(result.isErr()).toBe(true);
    });

    it('ignores stopped sessions when evaluating the limit (2 active + 10 stopped → ok)', () => {
      const result = validateSessionConcurrency([
        withState(0, 'capturing'),
        withState(1, 'transcribing'),
        withState(2, 'stopped'),
        withState(3, 'stopped'),
        withState(4, 'stopped'),
      ]);
      expect(result.isOk()).toBe(true);
    });
  });
});
