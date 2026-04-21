import { errAsync, okAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import { invariantViolationError, type DomainError } from '../../domain/shared/errors';
import { type TranslationPort, type TranslationResponse } from '../ports/translation-port';
import { createRouteTranscriptToTranslationUseCase } from './route-transcript-to-translation-use-case';

describe('createRouteTranscriptToTranslationUseCase (IMPL-403)', () => {
  it('delegates to TranslationPort and returns translated text + metadata', async () => {
    const port: TranslationPort & { translate: ReturnType<typeof vi.fn> } = {
      translate: vi.fn(() =>
        okAsync<TranslationResponse, DomainError>({
          text: 'こんにちは',
          detectedSourceLanguage: 'en',
          latencyMs: 312,
        }),
      ),
    };
    const useCase = createRouteTranscriptToTranslationUseCase({ translationPort: port });
    const result = await useCase({
      text: 'hello',
      sourceLanguage: 'en-US',
      targetLanguage: 'ja-JP',
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.text).toBe('こんにちは');
      expect(result.value.latencyMs).toBe(312);
    }
    expect(port.translate).toHaveBeenCalledWith({
      text: 'hello',
      sourceLanguage: 'en-US',
      targetLanguage: 'ja-JP',
    });
  });

  it('surfaces translation port failure', async () => {
    const port: TranslationPort = {
      translate: () =>
        errAsync<TranslationResponse, DomainError>(
          invariantViolationError({ invariant: 'translation-failed', details: 'timeout' }),
        ),
    };
    const useCase = createRouteTranscriptToTranslationUseCase({ translationPort: port });
    const result = await useCase({
      text: 'hello',
      sourceLanguage: 'en-US',
      targetLanguage: 'ja-JP',
    });
    expect(result.isErr()).toBe(true);
  });
});
