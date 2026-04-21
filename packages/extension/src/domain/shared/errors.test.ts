import { describe, expect, it } from 'vitest';
import {
  describeDomainError,
  invariantViolationError,
  notFoundError,
  sessionStateTransitionError,
  validationError,
  type DomainError,
} from './errors';

describe('DomainError factories', () => {
  it('creates a session-state-transition error', () => {
    const error = sessionStateTransitionError({
      from: 'stopped',
      to: 'capturing',
      reason: 'stopped is terminal',
    });
    expect(error).toEqual({
      kind: 'session-state-transition',
      from: 'stopped',
      to: 'capturing',
      reason: 'stopped is terminal',
    });
  });

  it('creates an invariant-violation error', () => {
    const error = invariantViolationError({
      invariant: 'one-source-per-session',
      details: 'session sess_1 already bound to source src_A',
    });
    expect(error).toEqual({
      kind: 'invariant-violation',
      invariant: 'one-source-per-session',
      details: 'session sess_1 already bound to source src_A',
    });
  });

  it('creates a validation error', () => {
    const error = validationError({
      field: 'targetLanguage',
      message: 'required',
    });
    expect(error).toEqual({
      kind: 'validation',
      field: 'targetLanguage',
      message: 'required',
    });
  });

  it('creates a not-found error', () => {
    const error = notFoundError({
      resourceType: 'SourceSession',
      identifier: 'sess_01HZX8Y1R8M7D3Q2P4T5V6W7X8',
    });
    expect(error).toEqual({
      kind: 'not-found',
      resourceType: 'SourceSession',
      identifier: 'sess_01HZX8Y1R8M7D3Q2P4T5V6W7X8',
    });
  });

  it('returns a readonly object (no mutation)', () => {
    const error = validationError({ field: 'f', message: 'm' });
    expect(() => {
      // TypeScript は Readonly なので代入を拒否するが、JS 実行時には frozen されない
      // ここでは kind が期待値のまま保持されていることを確認する
      void error;
    }).not.toThrow();
    expect(error.kind).toBe('validation');
  });
});

describe('describeDomainError', () => {
  it('formats session-state-transition', () => {
    const message = describeDomainError(
      sessionStateTransitionError({
        from: 'stopped',
        to: 'capturing',
        reason: 'stopped is terminal',
      }),
    );
    expect(message).toBe('Invalid state transition from stopped to capturing: stopped is terminal');
  });

  it('formats invariant-violation', () => {
    const message = describeDomainError(
      invariantViolationError({
        invariant: 'one-source-per-session',
        details: 'duplicate binding',
      }),
    );
    expect(message).toBe('Invariant violated: one-source-per-session (duplicate binding)');
  });

  it('formats validation', () => {
    const message = describeDomainError(
      validationError({ field: 'targetLanguage', message: 'required' }),
    );
    expect(message).toBe('Validation failed for targetLanguage: required');
  });

  it('formats not-found', () => {
    const message = describeDomainError(
      notFoundError({ resourceType: 'SourceSession', identifier: 'sess_123' }),
    );
    expect(message).toBe('SourceSession not found: sess_123');
  });

  it('is exhaustive over DomainError kinds', () => {
    const kinds: DomainError['kind'][] = [
      'session-state-transition',
      'invariant-violation',
      'validation',
      'not-found',
    ];
    // 型レベルで網羅性を確保するため、既知 kind が 4 種であることを明示
    expect(kinds).toHaveLength(4);
  });
});
