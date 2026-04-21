import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import { invariantViolationError, type DomainError } from '../../domain/shared/errors';

/**
 * IMPL-446 Timeout wrapper (acl.md §4.4)。
 *
 * 指定 ms 内に `ResultAsync` が resolve しなければ
 * `invariantViolationError({ invariant: 'operation-timeout' })` を返す。
 *
 * 設定値 (acl.md §4.4):
 * - STT 初回応答: 1000ms
 * - 翻訳: 800ms
 */
export const withTimeout = <T>(
  fn: () => ResultAsync<T, DomainError>,
  timeoutMs: number,
  label = 'operation',
): ResultAsync<T, DomainError> => {
  if (timeoutMs <= 0) {
    return errAsync<T, DomainError>(
      invariantViolationError({
        invariant: 'operation-timeout-config',
        details: 'timeoutMs must be positive',
      }),
    );
  }

  type Outcome = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: DomainError }>;

  const raceOutcome = new Promise<Outcome>((resolve) => {
    const timer = setTimeout(() => {
      resolve({
        ok: false,
        error: invariantViolationError({
          invariant: 'operation-timeout',
          details: `${label} timed out after ${String(timeoutMs)}ms`,
        }),
      });
    }, timeoutMs);
    timer.unref?.();
    void fn().match(
      (value) => {
        clearTimeout(timer);
        resolve({ ok: true, value });
      },
      (error) => {
        clearTimeout(timer);
        resolve({ ok: false, error });
      },
    );
  });

  return ResultAsync.fromSafePromise(raceOutcome).andThen((outcome) =>
    outcome.ok ? okAsync<T, DomainError>(outcome.value) : errAsync<T, DomainError>(outcome.error),
  );
};
