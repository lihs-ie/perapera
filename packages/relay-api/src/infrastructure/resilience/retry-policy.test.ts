import { errAsync, okAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import { invariantViolationError, type DomainError } from '../../domain/shared/errors';
import { createRetryPolicy } from './retry-policy';

const buildPolicy = (
  maxAttempts: number,
  overrides: Partial<Parameters<typeof createRetryPolicy>[0]> = {},
) =>
  createRetryPolicy({
    maxAttempts,
    initialDelayMs: 10,
    backoffFactor: 2,
    sleep: vi.fn(() => Promise.resolve()),
    random: () => 0.5, // deterministic jitter
    ...overrides,
  });

describe('createRetryPolicy (IMPL-446)', () => {
  it('throws when maxAttempts < 1', () => {
    expect(() =>
      createRetryPolicy({ maxAttempts: 0, initialDelayMs: 10, backoffFactor: 2 }),
    ).toThrow();
  });

  it('returns immediately on success (1 attempt)', async () => {
    const fn = vi.fn(() => okAsync<string, DomainError>('ok'));
    const policy = buildPolicy(3);
    const result = await policy.execute(fn);
    expect(result.isOk()).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries up to maxAttempts on failure', async () => {
    const fn = vi.fn(() =>
      errAsync<string, DomainError>(
        invariantViolationError({ invariant: 'transient', details: 'boom' }),
      ),
    );
    const policy = buildPolicy(3);
    const result = await policy.execute(fn);
    expect(result.isErr()).toBe(true);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('succeeds after transient failures within attempts', async () => {
    let calls = 0;
    const fn = vi.fn(() => {
      calls += 1;
      if (calls < 3) {
        return errAsync<string, DomainError>(
          invariantViolationError({ invariant: 'transient', details: 'boom' }),
        );
      }
      return okAsync<string, DomainError>('ok');
    });
    const policy = buildPolicy(5);
    const result = await policy.execute(fn);
    expect(result.isOk()).toBe(true);
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
