import { okAsync } from 'neverthrow';
import { describe, expect, it } from 'vitest';
import { type DomainError } from '../../domain/shared/errors';
import { type TranslationPort, type TranslationResponse } from './translation-port';

describe('TranslationPort contract', () => {
  it('returns text + detectedSourceLanguage + latencyMs', async () => {
    const port: TranslationPort = {
      translate: (request) =>
        okAsync<TranslationResponse, DomainError>({
          text: `[JA] ${request.text}`,
          detectedSourceLanguage: 'en',
          latencyMs: 250,
        }),
    };
    const result = await port.translate({
      text: 'hello',
      sourceLanguage: 'en-US',
      targetLanguage: 'ja-JP',
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.text).toBe('[JA] hello');
      expect(result.value.latencyMs).toBe(250);
    }
  });
});
