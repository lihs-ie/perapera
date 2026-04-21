import { ok, type Result } from 'neverthrow';
import { type LanguagePair } from '../session/language-pair.js';
import { type DomainError } from '../shared/errors.js';
import { type OverlaySettings } from './overlay-settings.js';
import { parseProfileIdentifier, type ProfileIdentifier } from './profile-identifier.js';

/**
 * 拡張プロファイル集約ルート (DD-212)。
 * 拡張全体の既定値 (言語ペア / オーバーレイ設定 / 自動言語判定) を保持する。
 *
 * 不変条件: 既定値は値オブジェクト (`LanguagePair` / `OverlaySettings`) の
 * 時点でバリデーション済。本集約では識別子検証と更新操作を提供する。
 */
export type ExtensionProfile = Readonly<{
  profileIdentifier: ProfileIdentifier;
  defaultLanguagePair: LanguagePair;
  defaultOverlaySettings: OverlaySettings;
  autoDetectEnabled: boolean;
}>;

export const createExtensionProfile = (params: {
  profileIdentifier: string;
  defaultLanguagePair: LanguagePair;
  defaultOverlaySettings: OverlaySettings;
  autoDetectEnabled: boolean;
}): Result<ExtensionProfile, DomainError> =>
  parseProfileIdentifier(params.profileIdentifier).map((profileIdentifier) => ({
    profileIdentifier,
    defaultLanguagePair: params.defaultLanguagePair,
    defaultOverlaySettings: params.defaultOverlaySettings,
    autoDetectEnabled: params.autoDetectEnabled,
  }));

export const updateDefaultLanguagePair = (
  profile: ExtensionProfile,
  languagePair: LanguagePair,
): Result<ExtensionProfile, DomainError> => ok({ ...profile, defaultLanguagePair: languagePair });

export const updateDefaultOverlaySettings = (
  profile: ExtensionProfile,
  overlaySettings: OverlaySettings,
): Result<ExtensionProfile, DomainError> =>
  ok({ ...profile, defaultOverlaySettings: overlaySettings });

export const toggleAutoDetect = (
  profile: ExtensionProfile,
  enabled: boolean,
): Result<ExtensionProfile, DomainError> => ok({ ...profile, autoDetectEnabled: enabled });
