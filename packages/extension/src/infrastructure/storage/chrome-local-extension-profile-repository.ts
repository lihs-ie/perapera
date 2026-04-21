import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import {
  createExtensionProfile,
  type ExtensionProfile,
} from '../../domain/profile/extension-profile';
import { createOverlaySettings } from '../../domain/profile/overlay-settings';
import { type ExtensionProfileRepository } from '../../domain/repositories/extension-profile-repository';
import { createLanguagePair } from '../../domain/session/language-pair';
import {
  invariantViolationError,
  notFoundError,
  type DomainError,
} from '../../domain/shared/errors';
import { type ChromeStorageAdapter } from './chrome-local-settings-store';

/**
 * Profile aggregate を chrome.storage.local の flat key 群にマッピングする際の
 * キー定数。既存 `ChromeLocalSettingsStore` が使用するキーと一致させることで、
 * settings-level API (個別フィールド単位) と profile-level API (aggregate 単位)
 * が同一データを読み書きする (DD-107)。
 *
 * `settings.profile.identifier` のみ profile repository 固有。
 */
const LANGUAGE_KEY = 'settings.language.defaultLanguagePair';
const OVERLAY_KEY = 'settings.overlay.defaultOverlaySettings';
const AUTO_DETECT_KEY = 'settings.language.autoDetectEnabled';
const PROFILE_ID_KEY = 'settings.profile.identifier';

const REQUIRED_KEYS = [LANGUAGE_KEY, OVERLAY_KEY, AUTO_DETECT_KEY, PROFILE_ID_KEY] as const;

const toPersistenceError =
  (scope: string) =>
  (cause: unknown): DomainError =>
    invariantViolationError({
      invariant: 'profile-persistence',
      details: `${scope}: ${cause instanceof Error ? cause.message : 'unknown error'}`,
    });

/**
 * IMPL-142 ChromeLocalExtensionProfileRepository (DD-262, DD-107, DB-005)。
 *
 * `ExtensionProfile` 集約を `chrome.storage.local` に単一プロファイル
 * (シングルトン "default") として永続化する adapter。MVP では profile は 1 つ
 * のみ想定 (`getDefault` / `save` のみ公開、複数プロファイル運用は Phase 6 以降)。
 *
 * 既存 `ChromeLocalSettingsStore` と同じ key 体系を再利用するため、片方で
 * 書いた値をもう片方で読むことができる (settings-level の個別更新と
 * profile-level の aggregate 更新の両立)。
 *
 * エラー:
 * - いずれかの必須キー不在: `notFoundError({ resourceType: 'ExtensionProfile', identifier: 'default' })`
 * - Zod バリデーション失敗 (domain 値オブジェクト factory 経由): propagate
 * - chrome.storage I/O 失敗: `invariantViolationError({ invariant: 'profile-persistence' })`
 */
export const createChromeLocalExtensionProfileRepository = (
  adapter: ChromeStorageAdapter,
): ExtensionProfileRepository => ({
  getDefault: () =>
    ResultAsync.fromPromise(
      adapter.get([...REQUIRED_KEYS]),
      toPersistenceError('getDefault'),
    ).andThen((raw): ResultAsync<ExtensionProfile, DomainError> => {
      const missing = REQUIRED_KEYS.some((key) => raw[key] === undefined);
      if (missing) {
        return errAsync<ExtensionProfile, DomainError>(
          notFoundError({ resourceType: 'ExtensionProfile', identifier: 'default' }),
        );
      }
      const languageResult = createLanguagePair(raw[LANGUAGE_KEY]);
      if (languageResult.isErr()) {
        return errAsync<ExtensionProfile, DomainError>(languageResult.error);
      }
      const overlayResult = createOverlaySettings(raw[OVERLAY_KEY]);
      if (overlayResult.isErr()) {
        return errAsync<ExtensionProfile, DomainError>(overlayResult.error);
      }
      const autoDetect = raw[AUTO_DETECT_KEY];
      if (typeof autoDetect !== 'boolean') {
        return errAsync<ExtensionProfile, DomainError>(
          invariantViolationError({
            invariant: 'profile-persistence',
            details: `${AUTO_DETECT_KEY} must be boolean`,
          }),
        );
      }
      const profileId = raw[PROFILE_ID_KEY];
      if (typeof profileId !== 'string') {
        return errAsync<ExtensionProfile, DomainError>(
          invariantViolationError({
            invariant: 'profile-persistence',
            details: `${PROFILE_ID_KEY} must be string`,
          }),
        );
      }
      const profileResult = createExtensionProfile({
        profileIdentifier: profileId,
        defaultLanguagePair: languageResult.value,
        defaultOverlaySettings: overlayResult.value,
        autoDetectEnabled: autoDetect,
      });
      if (profileResult.isErr()) {
        return errAsync<ExtensionProfile, DomainError>(profileResult.error);
      }
      return okAsync<ExtensionProfile, DomainError>(profileResult.value);
    }),

  save: (profile) =>
    ResultAsync.fromPromise(
      adapter.set({
        [PROFILE_ID_KEY]: profile.profileIdentifier,
        [LANGUAGE_KEY]: {
          source: profile.defaultLanguagePair.source,
          target: profile.defaultLanguagePair.target,
        },
        [OVERLAY_KEY]: {
          positionPreset: profile.defaultOverlaySettings.positionPreset,
          opacity: profile.defaultOverlaySettings.opacity,
          maxLines: profile.defaultOverlaySettings.maxLines,
          fontScale: profile.defaultOverlaySettings.fontScale,
          showOriginalText: profile.defaultOverlaySettings.showOriginalText,
          showTranslatedText: profile.defaultOverlaySettings.showTranslatedText,
        },
        [AUTO_DETECT_KEY]: profile.autoDetectEnabled,
      }),
      toPersistenceError('save'),
    ),
});
