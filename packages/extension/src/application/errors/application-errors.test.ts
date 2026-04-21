import { describe, expect, it } from 'vitest';
import {
  invariantViolationError,
  notFoundError,
  sessionStateTransitionError,
  validationError,
} from '../../domain/shared/errors';
import {
  conflictAppError,
  internalAppError,
  permissionRequiredAppError,
  sessionNotFoundAppError,
  toApplicationError,
  validationAppError,
  type ApplicationError,
} from './application-errors';

describe('ApplicationError factories', () => {
  describe('permissionRequiredAppError', () => {
    it('builds a permission-required variant with fixed code', () => {
      const error = permissionRequiredAppError({
        sourceType: 'microphone',
        message: 'Microphone permission required',
      });
      expect(error.type).toBe('permission-required');
      expect(error.code).toBe('CAPTURE-PERMISSION-DENIED');
      expect(error.sourceType).toBe('microphone');
      expect(error.message).toBe('Microphone permission required');
    });
  });

  describe('sessionNotFoundAppError', () => {
    it('builds a session-not-found variant carrying the identifier', () => {
      const error = sessionNotFoundAppError({
        identifier: 'session-123',
        message: 'Session not found',
      });
      expect(error.type).toBe('session-not-found');
      expect(error.code).toBe('SESSION_NOT_FOUND');
      expect(error.identifier).toBe('session-123');
    });
  });

  describe('validationAppError', () => {
    it('builds a validation variant with optional field and code override', () => {
      const error = validationAppError({
        field: 'LanguagePair',
        message: 'source and target must differ',
        code: 'UNSUPPORTED_LANGUAGE_PAIR',
      });
      expect(error.type).toBe('validation');
      expect(error.code).toBe('UNSUPPORTED_LANGUAGE_PAIR');
      expect(error.field).toBe('LanguagePair');
    });

    it('defaults to VALIDATION_FAILED when no code is supplied', () => {
      const error = validationAppError({ message: 'invalid payload' });
      expect(error.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('conflictAppError', () => {
    it('builds a conflict variant with INVALID_STATE_TRANSITION by default', () => {
      const error = conflictAppError({
        message: 'cannot stop from idle',
        details: 'idle -> stopped',
      });
      expect(error.type).toBe('conflict');
      expect(error.code).toBe('INVALID_STATE_TRANSITION');
      expect(error.details).toBe('idle -> stopped');
    });
  });

  describe('internalAppError', () => {
    it('builds an internal variant with INTERNAL_ERROR code', () => {
      const error = internalAppError({ message: 'unexpected' });
      expect(error.type).toBe('internal');
      expect(error.code).toBe('INTERNAL_ERROR');
    });
  });
});

describe('toApplicationError (DD-230 — use-case.md §9.2 mapping)', () => {
  it('maps not-found domain error to SessionNotFoundAppError', () => {
    const app = toApplicationError(
      notFoundError({ resourceType: 'SourceSession', identifier: 'session-123' }),
    );
    expect(app.type).toBe('session-not-found');
    expect(app.code).toBe('SESSION_NOT_FOUND');
    if (app.type === 'session-not-found') {
      expect(app.identifier).toBe('session-123');
    }
  });

  it('maps validation domain error to ValidationAppError', () => {
    const app = toApplicationError(
      validationError({ field: 'LanguagePair', message: 'source and target must differ' }),
    );
    expect(app.type).toBe('validation');
    expect(app.code).toBe('VALIDATION_FAILED');
    if (app.type === 'validation') {
      expect(app.field).toBe('LanguagePair');
    }
  });

  it('maps session-state-transition domain error to ConflictAppError', () => {
    const app = toApplicationError(
      sessionStateTransitionError({
        from: 'idle',
        to: 'capturing',
        reason: 'illegal shortcut',
      }),
    );
    expect(app.type).toBe('conflict');
    expect(app.code).toBe('INVALID_STATE_TRANSITION');
    if (app.type === 'conflict') {
      expect(app.details).toContain('idle');
      expect(app.details).toContain('capturing');
    }
  });

  it('maps invariant-violation domain error to ConflictAppError', () => {
    const app = toApplicationError(
      invariantViolationError({
        invariant: 'concurrent-session-limit',
        details: 'active count 3 would exceed limit 3',
      }),
    );
    expect(app.type).toBe('conflict');
    expect(app.code).toBe('INVALID_STATE_TRANSITION');
    if (app.type === 'conflict') {
      expect(app.details).toContain('concurrent-session-limit');
    }
  });

  it('covers all four DomainError kinds (no default branch needed for defined kinds)', () => {
    const app1 = toApplicationError(notFoundError({ resourceType: 'X', identifier: 'y' }));
    const app2 = toApplicationError(validationError({ field: 'x', message: 'y' }));
    const app3 = toApplicationError(
      sessionStateTransitionError({ from: 'idle', to: 'stopped', reason: 'x' }),
    );
    const app4 = toApplicationError(invariantViolationError({ invariant: 'x', details: 'y' }));
    const mapped: ApplicationError[] = [app1, app2, app3, app4];
    expect(mapped.every((e) => e.type !== 'internal')).toBe(true);
  });
});
