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
  satisfiesConcurrentSessionLimit,
} from './concurrent-session-limit-specification.js';

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

describe('ConcurrentSessionLimitSpecification (DD-270)', () => {
  it('exposes MAX_CONCURRENT_ACTIVE_SESSIONS = 3', () => {
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
      expect(isActiveSession(withState(0, state))).toBe(true);
    });

    it.each(TERMINAL)('treats %s as non-active (terminal)', (state) => {
      expect(isActiveSession(withState(0, state))).toBe(false);
    });

    it('covers all 11 SessionState variants in the categorization', () => {
      const covered = new Set<SessionState>([...ACTIVE, ...TERMINAL]);
      for (const state of SESSION_STATES) {
        expect(covered.has(state)).toBe(true);
      }
    });
  });

  describe('countActiveSessions', () => {
    it('returns 0 for an empty input', () => {
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

  describe('satisfiesConcurrentSessionLimit', () => {
    it('returns true for an empty session list', () => {
      expect(satisfiesConcurrentSessionLimit([])).toBe(true);
    });

    it('returns true when active count is below the limit', () => {
      expect(
        satisfiesConcurrentSessionLimit([withState(0, 'capturing'), withState(1, 'transcribing')]),
      ).toBe(true);
    });

    it('returns false when active count equals the limit (adding one more would exceed)', () => {
      expect(
        satisfiesConcurrentSessionLimit([
          withState(0, 'capturing'),
          withState(1, 'transcribing'),
          withState(2, 'translating'),
        ]),
      ).toBe(false);
    });

    it('returns false when active count exceeds the limit', () => {
      expect(
        satisfiesConcurrentSessionLimit([
          withState(0, 'capturing'),
          withState(1, 'transcribing'),
          withState(2, 'translating'),
          withState(3, 'paused'),
        ]),
      ).toBe(false);
    });

    it('ignores stopped sessions when counting', () => {
      expect(
        satisfiesConcurrentSessionLimit([
          withState(0, 'capturing'),
          withState(1, 'transcribing'),
          withState(2, 'stopped'),
          withState(3, 'stopped'),
          withState(4, 'stopped'),
        ]),
      ).toBe(true);
    });
  });
});
