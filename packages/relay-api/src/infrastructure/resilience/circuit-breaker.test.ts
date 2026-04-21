import { errAsync, okAsync } from 'neverthrow';
import { describe, expect, it } from 'vitest';
import { invariantViolationError, type DomainError } from '../../domain/shared/errors';
import { createCircuitBreaker } from './circuit-breaker';

const fail = () =>
  errAsync<string, DomainError>(
    invariantViolationError({ invariant: 'test-failure', details: 'boom' }),
  );
const succeed = () => okAsync<string, DomainError>('ok');

describe('createCircuitBreaker (IMPL-446)', () => {
  it('throws when failureThreshold is non-positive', () => {
    expect(() =>
      createCircuitBreaker({ failureThreshold: 0, windowMs: 1000, openMs: 1000 }),
    ).toThrow(/failureThreshold must be positive/);
  });

  it('starts in closed state and passes through success', async () => {
    const breaker = createCircuitBreaker({
      failureThreshold: 3,
      windowMs: 1000,
      openMs: 1000,
    });
    expect(breaker.state()).toBe('closed');
    const result = await breaker.execute(succeed);
    expect(result.isOk()).toBe(true);
    expect(breaker.state()).toBe('closed');
  });

  it('opens after failureThreshold consecutive failures', async () => {
    const breaker = createCircuitBreaker({
      failureThreshold: 3,
      windowMs: 5_000,
      openMs: 1_000,
    });
    await breaker.execute(fail);
    await breaker.execute(fail);
    expect(breaker.state()).toBe('closed');
    await breaker.execute(fail);
    expect(breaker.state()).toBe('open');
  });

  it('returns circuit-open error while open (cooling period)', async () => {
    const now = 0;
    const breaker = createCircuitBreaker({
      failureThreshold: 2,
      windowMs: 5_000,
      openMs: 1_000,
      clock: () => now,
    });
    await breaker.execute(fail);
    await breaker.execute(fail);
    expect(breaker.state()).toBe('open');

    const result = await breaker.execute(succeed);
    expect(result.isErr()).toBe(true);
    if (result.isErr() && result.error.kind === 'invariant-violation') {
      expect(result.error.invariant).toBe('circuit-open');
    }
  });

  it('transitions to half-open after openMs elapses, and closes on success', async () => {
    let now = 0;
    const breaker = createCircuitBreaker({
      failureThreshold: 2,
      windowMs: 5_000,
      openMs: 1_000,
      clock: () => now,
    });
    await breaker.execute(fail);
    await breaker.execute(fail);
    expect(breaker.state()).toBe('open');

    now = 1_500;
    const result = await breaker.execute(succeed);
    expect(result.isOk()).toBe(true);
    expect(breaker.state()).toBe('closed');
  });

  it('returns to open when half-open trial fails', async () => {
    let now = 0;
    const breaker = createCircuitBreaker({
      failureThreshold: 2,
      windowMs: 5_000,
      openMs: 1_000,
      clock: () => now,
    });
    await breaker.execute(fail);
    await breaker.execute(fail);
    now = 1_500;
    await breaker.execute(fail);
    expect(breaker.state()).toBe('open');
  });
});
