import { ok, type Result } from 'neverthrow';
import { DEFAULT_ENDPOINTING_POLICY, type EndpointingPolicy } from '../session/endpointing-policy';
import { type LanguagePair } from '../session/language-pair';
import {
  DEFAULT_TRANSLATION_CONTEXT_WINDOW,
  type TranslationContextWindow,
} from '../session/translation-context-window';
import { type DomainError } from '../shared/errors';
import { type OverlaySettings } from './overlay-settings';
import { parseProfileIdentifier, type ProfileIdentifier } from './profile-identifier';

/**
 * 拡張プロファイル集約ルート (DD-212)。
 * 拡張全体の既定値 (言語ペア / オーバーレイ設定 / 自動言語判定 /
 * エンドポインティング方針 / 翻訳文脈窓) を保持する。
 *
 * 不変条件: 既定値は値オブジェクト (`LanguagePair` / `OverlaySettings` /
 * `EndpointingPolicy` / `TranslationContextWindow`) の時点でバリデーション
 * 済。本集約では識別子検証と更新操作を提供する。
 */
export type ExtensionProfile = Readonly<{
  profileIdentifier: ProfileIdentifier;
  defaultLanguagePair: LanguagePair;
  defaultOverlaySettings: OverlaySettings;
  autoDetectEnabled: boolean;
  defaultEndpointingPolicy: EndpointingPolicy;
  defaultTranslationContextWindow: TranslationContextWindow;
}>;

export const createExtensionProfile = (params: {
  profileIdentifier: string;
  defaultLanguagePair: LanguagePair;
  defaultOverlaySettings: OverlaySettings;
  autoDetectEnabled: boolean;
  defaultEndpointingPolicy?: EndpointingPolicy;
  defaultTranslationContextWindow?: TranslationContextWindow;
}): Result<ExtensionProfile, DomainError> =>
  parseProfileIdentifier(params.profileIdentifier).map((profileIdentifier) => ({
    profileIdentifier,
    defaultLanguagePair: params.defaultLanguagePair,
    defaultOverlaySettings: params.defaultOverlaySettings,
    autoDetectEnabled: params.autoDetectEnabled,
    defaultEndpointingPolicy: params.defaultEndpointingPolicy ?? DEFAULT_ENDPOINTING_POLICY,
    defaultTranslationContextWindow:
      params.defaultTranslationContextWindow ?? DEFAULT_TRANSLATION_CONTEXT_WINDOW,
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

export const updateDefaultEndpointingPolicy = (
  profile: ExtensionProfile,
  policy: EndpointingPolicy,
): Result<ExtensionProfile, DomainError> => ok({ ...profile, defaultEndpointingPolicy: policy });

export const updateDefaultTranslationContextWindow = (
  profile: ExtensionProfile,
  window: TranslationContextWindow,
): Result<ExtensionProfile, DomainError> =>
  ok({ ...profile, defaultTranslationContextWindow: window });
