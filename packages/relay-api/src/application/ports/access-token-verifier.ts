import { type Result } from 'neverthrow';
import { type DomainError } from '../../domain/shared/errors';

/**
 * HTTP Bearer アクセストークン検証ポート (IMPL-430)。
 *
 * api-specification §2.3 の「HTTP 制御 API は拡張利用者に紐づくアクセス
 * トークン」に対応。拡張から送信される `Authorization: Bearer <token>` の
 * トークン文字列を検証する。
 *
 * MVP では env 変数由来の静的シークレット比較 (StaticAccessTokenVerifier)。
 * 将来的に IdP 連携が必要になれば port 実装を差し替える。
 *
 * **stream token との違い**:
 * - access token: HTTP control API (POST /sessions / GET /sessions/:id) で検証
 * - stream token: WebSocket /relay で JWT として検証 (JwtVerifier が担当)
 */
export type AccessTokenVerifier = Readonly<{
  verify: (bearer: string) => Result<void, DomainError>;
}>;
