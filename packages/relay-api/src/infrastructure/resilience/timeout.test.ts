import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import { describe, expect, it } from 'vitest';
import { invariantViolationError, type DomainError } from '../../domain/shared/errors';
import { withTimeout } from './timeout';

describe('withTimeout (IMPL-446)', () => {
  it('returns error when timeoutMs is non-positive', async () => {
    const result = await withTimeout(() => okAsync<string, DomainError>('ok'), 0);
    expect(result.isErr()).toBe(true);
  });

  it('resolves successfully when fn completes within timeout', async () => {
    const result = await withTimeout(() => okAsync<string, DomainError>('ok'), 1_000);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value).toBe('ok');
  });

  it('surfaces fn error when it fails before timeout', async () => {
    const result = await withTimeout(
      () =>
        errAsync<string, DomainError>(
          invariantViolationError({ invariant: 'downstream-failure', details: 'fast fail' }),
        ),
      1_000,
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr() && result.error.kind === 'invariant-violation') {
      expect(result.error.invariant).toBe('downstream-failure');
    }
  });

  it('returns operation-timeout error when fn exceeds timeoutMs', async () => {
    const slowFn = (): ResultAsync<string, DomainError> =>
      ResultAsync.fromSafePromise(
        new Promise<string>((resolve) => setTimeout(() => resolve('ok'), 200)),
      );
    const result = await withTimeout(slowFn, 50, 'slow-op');
    expect(result.isErr()).toBe(true);
    if (result.isErr() && result.error.kind === 'invariant-violation') {
      expect(result.error.invariant).toBe('operation-timeout');
      expect(result.error.details).toContain('slow-op');
    }
  });
});
