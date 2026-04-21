import { describe, expect, it } from 'vitest';
import { SESSION_STATES, type SessionState } from '../session/session-state.js';
import {
  ALLOWED_TRANSITIONS,
  canTransitionSessionState,
  validateSessionStateTransition,
} from './session-state-transition-policy.js';

/**
 * 状態遷移表 (detailed-design.md §7.2) を網羅的に検証する。
 * ALLOWED_TRANSITIONS は「遷移前 → 許容される遷移先配列」のテーブルで、
 * `stopped` への遷移は任意稼働状態から可能なので個別扱い。
 */

const ALLOWED_PAIRS: readonly (readonly [SessionState, SessionState])[] = [
  ['idle', 'requesting_permission'],
  ['requesting_permission', 'connecting'],
  ['requesting_permission', 'error'],
  ['connecting', 'capturing'],
  ['connecting', 'error'],
  ['capturing', 'transcribing'],
  ['capturing', 'paused'],
  ['capturing', 'reconnecting'],
  ['transcribing', 'translating'],
  ['transcribing', 'paused'],
  ['transcribing', 'reconnecting'],
  ['transcribing', 'degraded'],
  ['translating', 'transcribing'],
  ['translating', 'paused'],
  ['translating', 'reconnecting'],
  ['translating', 'degraded'],
  ['paused', 'capturing'],
  ['reconnecting', 'capturing'],
  ['reconnecting', 'error'],
  ['degraded', 'transcribing'],
];

const ACTIVE_STATES: readonly SessionState[] = [
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

describe('SessionStateTransitionPolicy (DD-241)', () => {
  describe('ALLOWED_TRANSITIONS table', () => {
    it('covers all 11 states as keys', () => {
      for (const state of SESSION_STATES) {
        expect(ALLOWED_TRANSITIONS).toHaveProperty(state);
      }
    });

    it('defines stopped as terminal (no outgoing transitions)', () => {
      expect(ALLOWED_TRANSITIONS.stopped).toEqual([]);
    });

    it('defines error as terminal in the table (stop is handled separately)', () => {
      expect(ALLOWED_TRANSITIONS.error).toEqual([]);
    });
  });

  describe('canTransitionSessionState', () => {
    it.each(ALLOWED_PAIRS)('permits %s → %s', (from, to) => {
      expect(canTransitionSessionState(from, to)).toBe(true);
    });

    it.each(ACTIVE_STATES)('permits %s → stopped (universal stop)', (from) => {
      expect(canTransitionSessionState(from, 'stopped')).toBe(true);
    });

    it('rejects stopped → stopped', () => {
      expect(canTransitionSessionState('stopped', 'stopped')).toBe(false);
    });

    it.each(SESSION_STATES)('rejects stopped → %s (terminal)', (to) => {
      expect(canTransitionSessionState('stopped', to)).toBe(false);
    });

    it('rejects idle → capturing (illegal shortcut)', () => {
      expect(canTransitionSessionState('idle', 'capturing')).toBe(false);
    });

    it('rejects capturing → degraded (degraded requires transcribing/translating)', () => {
      expect(canTransitionSessionState('capturing', 'degraded')).toBe(false);
    });

    it('rejects degraded → translating (only → transcribing permitted)', () => {
      expect(canTransitionSessionState('degraded', 'translating')).toBe(false);
    });

    it('rejects paused → transcribing (must return via capturing)', () => {
      expect(canTransitionSessionState('paused', 'transcribing')).toBe(false);
    });
  });

  describe('validateSessionStateTransition', () => {
    it('returns ok for permitted transition', () => {
      const result = validateSessionStateTransition('idle', 'requesting_permission', 'start');
      expect(result.isOk()).toBe(true);
    });

    it('returns session-state-transition error for forbidden transition', () => {
      const result = validateSessionStateTransition('idle', 'capturing', 'shortcut not allowed');
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.kind).toBe('session-state-transition');
        if (result.error.kind === 'session-state-transition') {
          expect(result.error.from).toBe('idle');
          expect(result.error.to).toBe('capturing');
          expect(result.error.reason).toBe('shortcut not allowed');
        }
      }
    });

    it('preserves custom reason in the error payload', () => {
      const reason = 'custom failure context provided by caller';
      const result = validateSessionStateTransition('stopped', 'capturing', reason);
      expect(result.isErr()).toBe(true);
      if (result.isErr() && result.error.kind === 'session-state-transition') {
        expect(result.error.reason).toBe(reason);
      }
    });

    it('rejects any transition from stopped (terminal state)', () => {
      for (const to of SESSION_STATES) {
        const result = validateSessionStateTransition('stopped', to, 'from terminal');
        expect(result.isErr()).toBe(true);
      }
    });

    it('permits universal stop from all active states', () => {
      for (const from of ACTIVE_STATES) {
        const result = validateSessionStateTransition(from, 'stopped', 'user stop');
        expect(result.isOk()).toBe(true);
      }
    });
  });
});
