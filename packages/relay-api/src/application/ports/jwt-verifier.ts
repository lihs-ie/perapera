import { type ResultAsync } from 'neverthrow';
import { type DomainError } from '../../domain/shared/errors';

/**
 * JwtVerifier が返す復号済みペイロード (IMPL-431 WebSocket 側)。
 *
 * - `jti` / `sub` / `expiresAtEpochSec` / `issuedAtEpochSec`: 標準 claims
 * - `claims`: signer が `extraClaims` に入れた session メタ (sourceType 等)
 *   だけを抽出したもの。`iss` / `aud` / `jti` / `sub` / `exp` / `iat` は含まない
 */
export type JwtVerifiedPayload = Readonly<{
  jti: string;
  sub: string;
  expiresAtEpochSec: number;
  issuedAtEpochSec: number;
  claims: Readonly<Record<string, unknown>>;
}>;

/**
 * WebSocket stream token 用の JWT 検証ポート。
 *
 * 対応する Signer: `application/ports/jwt-signer.ts`
 *
 * 失敗ケース (いずれも `invariantViolationError`):
 * - 署名不正 / 鍵違い
 * - 有効期限切れ (exp 超過)
 * - issuer / audience 不一致
 * - 必須 claim (jti / sub / exp / iat) が欠落
 * - トークン形式異常
 *
 * WebSocket handler は result.isErr で接続を拒否する。
 */
export type JwtVerifier = Readonly<{
  verify: (token: string) => ResultAsync<JwtVerifiedPayload, DomainError>;
}>;
