import { describe, expect, it } from 'vitest';
import {
  invariantViolationError,
  notFoundError,
  sessionStateTransitionError,
  validationError,
} from './errors';

describe('domain error factory functions', () => {
  it('sessionStateTransitionError builds a tagged error', () => {
    const err = sessionStateTransitionError({
      from: 'created',
      to: 'ended',
      reason: 'cannot skip streaming',
    });
    expect(err).toEqual({
      kind: 'session-state-transition',
      from: 'created',
      to: 'ended',
      reason: 'cannot skip streaming',
    });
  });

  it('invariantViolationError builds a tagged error', () => {
    const err = invariantViolationError({
      invariant: 'stream-token-expired',
      details: 'token expired before connect',
    });
    expect(err.kind).toBe('invariant-violation');
    expect(err.invariant).toBe('stream-token-expired');
  });

  it('validationError builds a tagged error', () => {
    const err = validationError({ field: 'sourceType', message: 'must be one of ...' });
    expect(err.kind).toBe('validation');
  });

  it('notFoundError builds a tagged error', () => {
    const err = notFoundError({ resourceType: 'Session', identifier: 'sess_xxx' });
    expect(err.kind).toBe('not-found');
  });
});
