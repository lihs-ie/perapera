import { ResultAsync } from 'neverthrow';
import { SignJWT } from 'jose';
import { type JwtSigner, type JwtSignerPayload } from '../../application/ports/jwt-signer';
import { invariantViolationError, type DomainError } from '../../domain/shared/errors';

/**
 * `JwtSigner` の jose 実装 (IMPL-431 の一部)。
 *
 * HS256 (HMAC-SHA256) で WebSocket stream token 用の短命 JWT を署名する。
 * 秘密鍵は Cloud Run 環境変数 (`STREAM_TOKEN_SECRET`) 等から注入する想定。
 *
 * **本番実装で mock が利用されない設計**:
 * - `secretKey` / `issuer` / `audience` は必須 DI (default なし)
 * - production entrypoint で `new TextEncoder().encode(process.env.STREAM_TOKEN_SECRET)` を明示的に渡す
 *
 * 注: RS256 / ES256 への移行は後続 issue。鍵ローテーションも同様。
 */
export type JoseJwtSignerDependencies = Readonly<{
  secretKey: Uint8Array;
  issuer: string;
  audience: string;
}>;

export const createJoseJwtSigner = (deps: JoseJwtSignerDependencies): JwtSigner => {
  if (deps.secretKey.byteLength < 32) {
    throw new Error('JoseJwtSigner: HS256 secretKey must be at least 32 bytes (256-bit)');
  }
  return {
    sign: (payload: JwtSignerPayload) => {
      const extra = payload.extraClaims ?? {};
      const token = new SignJWT(extra)
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setJti(payload.jti)
        .setSubject(payload.sub)
        .setIssuer(deps.issuer)
        .setAudience(deps.audience)
        .setIssuedAt()
        .setExpirationTime(payload.expiresAtEpochSec)
        .sign(deps.secretKey);
      return ResultAsync.fromPromise<string, DomainError>(token, (cause) =>
        invariantViolationError({
          invariant: 'jwt-signing-failed',
          details: cause instanceof Error ? cause.message : 'unknown signing error',
        }),
      );
    },
  };
};
