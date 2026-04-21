import { timingSafeEqual } from 'node:crypto';
import { err, ok, type Result } from 'neverthrow';
import { type AccessTokenVerifier } from '../../application/ports/access-token-verifier';
import { invariantViolationError, type DomainError } from '../../domain/shared/errors';

/**
 * `AccessTokenVerifier` の静的シークレット実装 (IMPL-430)。
 *
 * env 変数から配列で供給されたトークンと `timingSafeEqual` で比較する
 * (タイミング攻撃対策)。Mock / in-memory とは異なり、**本番運用で直接利用
 * される** production 実装。
 *
 * **allowedTokens の運用**:
 * - MVP は 1 つのトークンで運用
 * - 鍵ローテーション時は `[old, new]` の 2 本体制にして切替
 * - 全数を `timingSafeEqual` で比較するため、N 個あると O(N) 時間
 *
 * **Fail-fast**:
 * - `allowedTokens` が空 → factory で `throw`
 * - 各トークンが 16 文字未満 → factory で `throw` (エントロピー不足防止)
 */
export type StaticAccessTokenVerifierDependencies = Readonly<{
  allowedTokens: readonly string[];
}>;

const MIN_TOKEN_LENGTH = 16;

const safeStringCompare = (a: string, b: string): boolean => {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
};

export const createStaticAccessTokenVerifier = (
  deps: StaticAccessTokenVerifierDependencies,
): AccessTokenVerifier => {
  if (deps.allowedTokens.length === 0) {
    throw new Error('StaticAccessTokenVerifier: allowedTokens must not be empty');
  }
  for (const token of deps.allowedTokens) {
    if (token.length < MIN_TOKEN_LENGTH) {
      throw new Error(
        `StaticAccessTokenVerifier: each token must be at least ${MIN_TOKEN_LENGTH} characters`,
      );
    }
  }
  const tokens = [...deps.allowedTokens];
  return {
    verify: (bearer: string): Result<void, DomainError> => {
      const matched = tokens.some((allowed) => safeStringCompare(bearer, allowed));
      if (!matched) {
        return err(
          invariantViolationError({
            invariant: 'access-token-invalid',
            details: 'access token does not match any allowed token',
          }),
        );
      }
      return ok(undefined);
    },
  };
};
