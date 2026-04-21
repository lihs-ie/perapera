import { ResultAsync, errAsync } from 'neverthrow';
import { type DomainError } from '../../domain/shared/errors';

/**
 * IMPL-446 Retry with exponential backoff + jitter (acl.md §6.2)。
 *
 * 設定値 (acl.md より):
 * - STT: 最大 3 回、初回 250ms、バックオフ 2.0x
 * - Translation: 最大 1 回、初回 150ms
 *
 * jitter: `Math.random()` を既定注入。test では DI で deterministic に。
 */
export type RetryPolicyConfig = Readonly<{
  maxAttempts: number;
  initialDelayMs: number;
  backoffFactor: number;
  maxDelayMs?: number;
  jitterRatio?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}>;

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const createRetryPolicy = (config: RetryPolicyConfig) => {
  if (config.maxAttempts < 1) {
    throw new Error('createRetryPolicy: maxAttempts must be >= 1');
  }
  const sleep = config.sleep ?? defaultSleep;
  const random = config.random ?? Math.random;
  const maxDelayMs = config.maxDelayMs ?? Number.POSITIVE_INFINITY;
  const jitterRatio = config.jitterRatio ?? 0.2;

  const delayAt = (attempt: number): number => {
    const base = config.initialDelayMs * Math.pow(config.backoffFactor, attempt - 1);
    const capped = Math.min(base, maxDelayMs);
    const jitter = capped * jitterRatio * (random() * 2 - 1);
    return Math.max(0, Math.round(capped + jitter));
  };

  return {
    execute: <T>(fn: () => ResultAsync<T, DomainError>): ResultAsync<T, DomainError> => {
      const attempt = (n: number): ResultAsync<T, DomainError> =>
        fn().orElse((error) => {
          if (n >= config.maxAttempts) return errAsync<T, DomainError>(error);
          return ResultAsync.fromSafePromise(sleep(delayAt(n))).andThen(() => attempt(n + 1));
        });
      return attempt(1);
    },
  };
};
