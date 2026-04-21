import { type ResultAsync } from 'neverthrow';
import { type ExtensionProfile } from '../profile/extension-profile';
import { type DomainError } from '../shared/errors';

/**
 * 拡張プロファイルリポジトリ (DD-262)。
 *
 * 拡張全体の既定値 (言語ペア / オーバーレイ設定 / 自動判定有無) を保持する
 * `ExtensionProfile` 集約の永続化契約。MVP ではシングルプロファイル想定で
 * `chrome.storage.local` にマッピングされる (DD-107 ChromeLocalSettingsStore)。
 *
 * エラー:
 * - `getDefault`: 初回起動・未初期化時は
 *   `notFoundError({ resourceType: 'ExtensionProfile', identifier: 'default' })`
 *   を Err で返す。呼び出し側は初期化 UseCase で seed する
 * - `save`: storage quota 超過等の書き込み失敗時は
 *   `invariantViolationError({ invariant: 'profile-persistence', ... })` を想定
 *
 * `save` は upsert (冪等) — create / update の両方で本メソッドを呼ぶ。
 */
export type ExtensionProfileRepository = Readonly<{
  getDefault: () => ResultAsync<ExtensionProfile, DomainError>;
  save: (profile: ExtensionProfile) => ResultAsync<void, DomainError>;
}>;
