import { ok, type Result } from 'neverthrow';
import { type ExtensionProfile } from '../profile/extension-profile';
import { type EndpointingPolicy } from '../session/endpointing-policy';
import { type TranslationContextWindow } from '../session/translation-context-window';
import { type DomainError } from '../shared/errors';

/**
 * エンドポインティング方針リゾルバ (DD-244)。
 *
 * 拡張プロファイル既定値とセッション個別の override を合成し、
 * ソースセッションで使う `EndpointingPolicy` / `TranslationContextWindow`
 * を決定する。優先度:
 *
 * 1. `override` が提供されていればそれを返す (セッション固有の明示指定)
 * 2. なければ `profile.default*` を返す
 *
 * 値オブジェクトの時点で既に範囲検証済なので、本サービスは選択のみ行う。
 * 失敗することがなくても API の一貫性のため `Result` を返す。
 */
export type EndpointingResolverInput = Readonly<{
  profile: ExtensionProfile;
  override?: EndpointingPolicy;
}>;

export type TranslationContextResolverInput = Readonly<{
  profile: ExtensionProfile;
  override?: TranslationContextWindow;
}>;

export const resolveEffectiveEndpointingPolicy = (
  input: EndpointingResolverInput,
): Result<EndpointingPolicy, DomainError> =>
  ok(input.override ?? input.profile.defaultEndpointingPolicy);

export const resolveEffectiveTranslationContextWindow = (
  input: TranslationContextResolverInput,
): Result<TranslationContextWindow, DomainError> =>
  ok(input.override ?? input.profile.defaultTranslationContextWindow);
