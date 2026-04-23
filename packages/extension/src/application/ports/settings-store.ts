import { type ResultAsync } from 'neverthrow';
import { type OverlaySettings } from '../../domain/profile/overlay-settings';
import { type LanguagePair } from '../../domain/session/language-pair';
import { type DomainError } from '../../domain/shared/errors';

/**
 * Relay 接続の user override (Issue 107 Step B)。
 *
 * `wxt.config.ts` の build-time env (`PERAPERA_RELAY_API_BASE_URL` /
 * `PERAPERA_RELAY_ACCESS_TOKEN`) に優先する override。staging / production
 * 切替や accessToken rotation 用途に使う。両フィールド atomic set、partial は
 * 許容しない (`save` で両方必須、`clear` で env default に戻す)。
 */
export type RelayConnectionOverride = Readonly<{
  baseUrl: string;
  accessToken: string;
}>;

/**
 * 設定ストアポート (DD-107)。
 *
 * 拡張の既定値 (言語ペア / オーバーレイ設定) を `chrome.storage.local` 等の
 * 軽量ストレージに保存する抽象 interface。起動時即時復元用途 (DB-005)。
 *
 * キーは値オブジェクト単位に型特化し、キー文字列は infrastructure 実装の
 * 詳細として扱う (呼び出し側は keyed generic API を意識しない)。
 *
 * エラー:
 * - `getDefault*`: 未初期化時
 *   `notFoundError({ resourceType, identifier: 'default' })` を Err で返す
 * - `getRelayConnectionOverride`: 未初期化時は `Ok(null)` (未設定 = env
 *   default 使用が正常フロー)
 * - `save*` / `clear*`: storage 書き込み失敗時
 *   `invariantViolationError` を想定
 */
export type SettingsStore = Readonly<{
  getDefaultLanguagePair: () => ResultAsync<LanguagePair, DomainError>;
  saveDefaultLanguagePair: (pair: LanguagePair) => ResultAsync<void, DomainError>;
  getDefaultOverlaySettings: () => ResultAsync<OverlaySettings, DomainError>;
  saveDefaultOverlaySettings: (settings: OverlaySettings) => ResultAsync<void, DomainError>;
  getRelayConnectionOverride: () => ResultAsync<RelayConnectionOverride | null, DomainError>;
  saveRelayConnectionOverride: (
    override: RelayConnectionOverride,
  ) => ResultAsync<void, DomainError>;
  clearRelayConnectionOverride: () => ResultAsync<void, DomainError>;
}>;
