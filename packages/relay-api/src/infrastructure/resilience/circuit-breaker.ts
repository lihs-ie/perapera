import { ResultAsync, errAsync } from 'neverthrow';
import { invariantViolationError, type DomainError } from '../../domain/shared/errors';

/**
 * IMPL-446 Circuit breaker (acl.md §6)。
 *
 * 失敗の連鎖を早期遮断するための 3 状態マシン:
 * - `closed`: 通常。失敗が閾値を超えると `open` へ
 * - `open`: 全リクエストを即座に拒否。一定時間経過で `half-open` へ
 * - `half-open`: 試験的に 1 リクエスト通す。成功で `closed`、失敗で `open` 復帰
 *
 * 設定値 (acl.md §6.1 より):
 * - STT / Translation: 5 failures / 30s window で open、open 15s
 */
export type CircuitBreakerConfig = Readonly<{
  failureThreshold: number;
  windowMs: number;
  openMs: number;
  clock?: () => number;
}>;

type State = 'closed' | 'open' | 'half-open';

export type CircuitBreaker = Readonly<{
  execute: <T>(fn: () => ResultAsync<T, DomainError>) => ResultAsync<T, DomainError>;
  state: () => State;
}>;

export const createCircuitBreaker = (config: CircuitBreakerConfig): CircuitBreaker => {
  if (config.failureThreshold <= 0) {
    throw new Error('createCircuitBreaker: failureThreshold must be positive');
  }
  if (config.windowMs <= 0 || config.openMs <= 0) {
    throw new Error('createCircuitBreaker: windowMs and openMs must be positive');
  }
  const clock = config.clock ?? (() => Date.now());

  let state: State = 'closed';
  let failureTimestamps: number[] = [];
  let openedAt: number | null = null;

  const prune = (now: number): void => {
    failureTimestamps = failureTimestamps.filter((t) => now - t < config.windowMs);
  };

  const trip = (now: number): void => {
    state = 'open';
    openedAt = now;
  };

  const reset = (): void => {
    state = 'closed';
    failureTimestamps = [];
    openedAt = null;
  };

  return {
    execute: <T>(fn: () => ResultAsync<T, DomainError>): ResultAsync<T, DomainError> => {
      const now = clock();
      if (state === 'open') {
        if (openedAt !== null && now - openedAt < config.openMs) {
          return errAsync<T, DomainError>(
            invariantViolationError({
              invariant: 'circuit-open',
              details: `circuit breaker is open (cooling down for ${String(config.openMs)}ms)`,
            }),
          );
        }
        state = 'half-open';
      }
      return fn()
        .map((value): T => {
          if (state === 'half-open') {
            reset();
          } else {
            prune(now);
          }
          return value;
        })
        .mapErr((error) => {
          if (state === 'half-open') {
            trip(clock());
          } else {
            failureTimestamps.push(clock());
            prune(clock());
            if (failureTimestamps.length >= config.failureThreshold) {
              trip(clock());
            }
          }
          return error;
        });
    },
    state: () => state,
  };
};
