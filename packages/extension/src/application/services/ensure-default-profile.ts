import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import {
  createExtensionProfile,
  type ExtensionProfile,
} from '../../domain/profile/extension-profile';
import { createOverlaySettings } from '../../domain/profile/overlay-settings';
import {
  createProfileIdentifier,
  type ProfileIdentifier,
} from '../../domain/profile/profile-identifier';
import { type ExtensionProfileRepository } from '../../domain/repositories/extension-profile-repository';
import { createLanguagePair } from '../../domain/session/language-pair';
import { invariantViolationError, type DomainError } from '../../domain/shared/errors';

/**
 * 初回起動時に `ExtensionProfile` 既定値を chrome.storage.local に seed する
 * application service。
 *
 * 課題: 拡張インストール直後は `settings.profile.identifier` 等の必須キーが
 * chrome.storage.local に存在せず、`getDefaultSessionSettingsQuery` 経由で
 * `NotFoundError({ resourceType: 'ExtensionProfile', identifier: 'default' })`
 * が返り、Popup の「開始」押下時にエラー表示されていた。
 *
 * 本 service は次のように動く:
 * - `getDefault` が ok → そのまま返す (no-op)
 * - `getDefault` が `not-found` (ExtensionProfile) → 既定値で build + save + 返却
 * - `getDefault` が他のエラー → そのまま伝搬 (seed しない)
 * - `save` が失敗 → エラーを伝搬
 *
 * 既定値 (MVP, 日本語ユーザー想定):
 * - `defaultLanguagePair`: en-US → ja-JP
 * - `defaultOverlaySettings`: bottom / opacity 0.85 / 3 行 / fontScale 1.0 /
 *   original + translated の両方表示
 * - `autoDetectEnabled`: true (UI 側で disable 選択可能)
 * - `profileIdentifier`: `createProfileIdentifier` (ULID) を発行
 */
export type EnsureDefaultProfile = Readonly<{
  ensure: () => ResultAsync<ExtensionProfile, DomainError>;
}>;

export type EnsureDefaultProfileDependencies = Readonly<{
  extensionProfileRepository: ExtensionProfileRepository;
  /** Profile ID 生成の seam (test で deterministic ULID を注入するため) */
  generateProfileIdentifier?: () => ProfileIdentifier;
}>;

const buildDefaultProfile = (
  profileIdentifier: ProfileIdentifier,
): ResultAsync<ExtensionProfile, DomainError> => {
  const languageResult = createLanguagePair({ source: 'en-US', target: 'ja-JP' });
  if (languageResult.isErr()) {
    return errAsync(
      invariantViolationError({
        invariant: 'ensure-default-profile',
        details: `default language pair validation failed: ${languageResult.error.kind}`,
      }),
    );
  }
  const overlayResult = createOverlaySettings({
    positionPreset: 'bottom',
    opacity: 0.85,
    maxLines: 3,
    fontScale: 1.0,
    showOriginalText: true,
    showTranslatedText: true,
  });
  if (overlayResult.isErr()) {
    return errAsync(
      invariantViolationError({
        invariant: 'ensure-default-profile',
        details: `default overlay settings validation failed: ${overlayResult.error.kind}`,
      }),
    );
  }
  const profileResult = createExtensionProfile({
    profileIdentifier,
    defaultLanguagePair: languageResult.value,
    defaultOverlaySettings: overlayResult.value,
    autoDetectEnabled: true,
  });
  if (profileResult.isErr()) {
    return errAsync(profileResult.error);
  }
  return okAsync(profileResult.value);
};

export const createEnsureDefaultProfile = (
  deps: EnsureDefaultProfileDependencies,
): EnsureDefaultProfile => {
  const generateIdentifier = deps.generateProfileIdentifier ?? createProfileIdentifier;
  return {
    ensure: () =>
      deps.extensionProfileRepository.getDefault().orElse((error) => {
        if (!(error.kind === 'not-found' && error.resourceType === 'ExtensionProfile')) {
          return errAsync<ExtensionProfile, DomainError>(error);
        }
        return buildDefaultProfile(generateIdentifier()).andThen((profile) =>
          deps.extensionProfileRepository.save(profile).map(() => profile),
        );
      }),
  };
};
