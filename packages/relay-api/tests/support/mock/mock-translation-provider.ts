import { okAsync } from 'neverthrow';
import { type DomainError } from '../../../src/domain/shared/errors';
import {
  type TranslationPort,
  type TranslationResponse,
} from '../../../src/application/ports/translation-port';

/**
 * tests/support/mock: `TranslationPort` の deterministic な mock。
 *
 * **src/ からは import しない** (ESLint `no-restricted-imports` で防御)。
 * 辞書を渡して翻訳結果を制御する。辞書に無い text は `[<target>] <text>`
 * 形式の placeholder を返す。
 */
export type MockTranslationProviderConfig = Readonly<{
  translations?: ReadonlyMap<string, string>;
  latencyMs?: number;
}>;

export const createMockTranslationProvider = (
  config: MockTranslationProviderConfig = {},
): TranslationPort => {
  const dictionary = config.translations ?? new Map<string, string>();
  const latencyMs = config.latencyMs ?? 100;
  return {
    translate: (request) => {
      const found = dictionary.get(request.text);
      const translated = found ?? `[${request.targetLanguage}] ${request.text}`;
      return okAsync<TranslationResponse, DomainError>({
        text: translated,
        detectedSourceLanguage: request.sourceLanguage,
        latencyMs,
      });
    },
  };
};
