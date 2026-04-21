import { type ResultAsync } from 'neverthrow';
import { type OverlaySettings } from '../../domain/profile/overlay-settings';
import { type LanguagePair } from '../../domain/session/language-pair';
import { type DomainError } from '../../domain/shared/errors';

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
 * - `saveDefault*`: storage 書き込み失敗時
 *   `invariantViolationError` を想定
 */
export type SettingsStore = Readonly<{
  getDefaultLanguagePair: () => ResultAsync<LanguagePair, DomainError>;
  saveDefaultLanguagePair: (pair: LanguagePair) => ResultAsync<void, DomainError>;
  getDefaultOverlaySettings: () => ResultAsync<OverlaySettings, DomainError>;
  saveDefaultOverlaySettings: (settings: OverlaySettings) => ResultAsync<void, DomainError>;
}>;
