import { type ResultAsync } from 'neverthrow';
import { type DomainError } from '../../domain/shared/errors';

/**
 * WebSocket stream token 用の JWT 署名ポート (IMPL-431)。
 *
 * Relay API は短命 (TTL 5〜30 分を想定) の JWT を発行し、WebSocket 接続時に
 * `Authorization: Bearer <jwt>` で検証する。本 port は `jose` を用いた
 * 実装 (infrastructure 層) へのアクセスを抽象化する。
 *
 * **stateless 設計** (Cloud Run 複数インスタンス対応):
 * Relay API は中央ストアを持たず、session メタは全て JWT claims に格納する。
 * WebSocket 側で JWT を verify すれば session 情報が復元できるため、
 * インスタンス間で状態を共有する必要がない。
 *
 * **payload の扱い**:
 * - `jti`: `StreamTokenIdentifier` (`strm_<ULID>`)
 * - `sub`: `SessionIdentifier` (`<ULID>`)
 * - `exp`: token 失効 UNIX epoch 秒
 * - `extraClaims`: session メタ (sourceType / languages / overlayTarget 等)。
 *   nested object を含むため `unknown` を許容し、jose が JSON シリアライズする
 * - その他のフィールド (iss / aud) は実装側で付加
 */
export type JwtSignerPayload = Readonly<{
  jti: string;
  sub: string;
  expiresAtEpochSec: number;
  extraClaims?: Readonly<Record<string, unknown>>;
}>;

/**
 * JwtSigner port。`sign(payload)` で JWT 文字列を返す。
 * 検証は別 port (`JwtVerifier`) に分ける想定 (WebSocket 側で利用)。
 */
export type JwtSigner = Readonly<{
  sign: (payload: JwtSignerPayload) => ResultAsync<string, DomainError>;
}>;
