import { ok, type Result } from 'neverthrow';
import { type ExtensionProfile } from '../profile/extension-profile.js';
import { createLanguagePair, type LanguagePair } from '../session/language-pair.js';
import { type DomainError } from '../shared/errors.js';

/**
 * 言語ルーティングポリシー (DD-243)。
 *
 * 自動判定有無と既定設定から、ソースセッションで使う有効な `LanguagePair` を
 * 決定する。優先度:
 *
 * 1. `override` が提供されていればそれを返す (セッション固有の明示指定)
 * 2. `profile.autoDetectEnabled === true` かつ `detectedSource` 提供時は
 *    `{ source: detectedSource, target: profile.defaultLanguagePair.target }`
 *    を新規 `LanguagePair` として生成 (BCP-47 + 同言語禁止の検証は VO に委譲)
 * 3. 上記に該当しなければ `profile.defaultLanguagePair` を返す
 */
export type LanguageRoutingInput = Readonly<{
  profile: ExtensionProfile;
  override?: LanguagePair;
  detectedSource?: string;
}>;

export const resolveEffectiveLanguagePair = (
  input: LanguageRoutingInput,
): Result<LanguagePair, DomainError> => {
  if (input.override !== undefined) {
    return ok(input.override);
  }
  if (input.profile.autoDetectEnabled && input.detectedSource !== undefined) {
    return createLanguagePair({
      source: input.detectedSource,
      target: input.profile.defaultLanguagePair.target,
    });
  }
  return ok(input.profile.defaultLanguagePair);
};
