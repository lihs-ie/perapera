import { ResultAsync, err, ok, type Result } from 'neverthrow';
import { jwtVerify, type JWTPayload } from 'jose';
import { type JwtVerifiedPayload, type JwtVerifier } from '../../application/ports/jwt-verifier';
import { invariantViolationError, type DomainError } from '../../domain/shared/errors';

/**
 * `JwtVerifier` の jose 実装 (IMPL-431 WebSocket 側)。
 *
 * HS256 で署名された stream token を検証する。対応する signer は
 * `createJoseJwtSigner`。両者は同一の `secretKey` / `issuer` / `audience` を
 * 共有する必要がある (production では同じ環境変数から注入する)。
 *
 * 検証内容 (jose `jwtVerify` が自動で行う項目):
 * - 署名検証 (HS256 HMAC)
 * - `iss` が期待値と一致
 * - `aud` が期待値と一致
 * - `exp` が現在時刻を超過していない
 *
 * 本実装で追加の検証:
 * - `jti` / `sub` / `exp` / `iat` の型 (string / number) を確認し、欠落時は
 *   `invariantViolationError` で弾く (JWT 標準 claims の type 違反)
 *
 * **本番実装で mock が利用されない設計**:
 * - `secretKey` / `issuer` / `audience` は必須 DI
 * - production entrypoint で signer と同じ値を渡す
 */
export type JoseJwtVerifierDependencies = Readonly<{
  secretKey: Uint8Array;
  issuer: string;
  audience: string;
}>;

const STANDARD_CLAIM_KEYS = new Set(['iss', 'aud', 'jti', 'sub', 'exp', 'iat', 'nbf']);

const extractCustomClaims = (payload: JWTPayload): Record<string, unknown> => {
  const custom: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!STANDARD_CLAIM_KEYS.has(key)) {
      custom[key] = value;
    }
  }
  return custom;
};

const narrowPayload = (payload: JWTPayload): Result<JwtVerifiedPayload, DomainError> => {
  if (typeof payload.jti !== 'string' || payload.jti.length === 0) {
    return err(
      invariantViolationError({
        invariant: 'jwt-missing-jti',
        details: 'verified payload must contain a non-empty jti',
      }),
    );
  }
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    return err(
      invariantViolationError({
        invariant: 'jwt-missing-sub',
        details: 'verified payload must contain a non-empty sub',
      }),
    );
  }
  if (typeof payload.exp !== 'number') {
    return err(
      invariantViolationError({
        invariant: 'jwt-missing-exp',
        details: 'verified payload must contain a numeric exp',
      }),
    );
  }
  if (typeof payload.iat !== 'number') {
    return err(
      invariantViolationError({
        invariant: 'jwt-missing-iat',
        details: 'verified payload must contain a numeric iat',
      }),
    );
  }
  return ok<JwtVerifiedPayload, DomainError>({
    jti: payload.jti,
    sub: payload.sub,
    expiresAtEpochSec: payload.exp,
    issuedAtEpochSec: payload.iat,
    claims: extractCustomClaims(payload),
  });
};

export const createJoseJwtVerifier = (deps: JoseJwtVerifierDependencies): JwtVerifier => {
  if (deps.secretKey.byteLength < 32) {
    throw new Error('JoseJwtVerifier: HS256 secretKey must be at least 32 bytes (256-bit)');
  }
  return {
    verify: (token: string) => {
      return ResultAsync.fromPromise(
        jwtVerify(token, deps.secretKey, {
          issuer: deps.issuer,
          audience: deps.audience,
        }),
        (cause) =>
          invariantViolationError({
            invariant: 'jwt-verification-failed',
            details: cause instanceof Error ? cause.message : 'unknown verification error',
          }),
      ).andThen(({ payload }) => narrowPayload(payload));
    },
  };
};
