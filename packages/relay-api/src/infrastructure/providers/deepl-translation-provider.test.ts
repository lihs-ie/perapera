import { describe, expect, it } from 'vitest';
import { createDeepLTranslationProvider } from './deepl-translation-provider';

const buildFetchImpl = (response: { status: number; body: unknown } | Error): typeof fetch => {
  const impl = (_input: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    if (response instanceof Error) {
      return Promise.reject(response);
    }
    const payload = JSON.stringify(response.body);
    return Promise.resolve(
      new Response(payload, {
        status: response.status,
        headers: { 'content-type': 'application/json' },
      }),
    );
  };
  return impl;
};

const clock = () => {
  let t = 0;
  return () => {
    const prev = t;
    t += 100;
    return prev;
  };
};

describe('createDeepLTranslationProvider (IMPL-445)', () => {
  it('throws when apiKey is empty', () => {
    expect(() =>
      createDeepLTranslationProvider({
        apiKey: '',
        fetchImpl: buildFetchImpl({ status: 200, body: {} }),
      }),
    ).toThrow(/apiKey must be non-empty/);
  });

  it('translates text and returns translated text + latency', async () => {
    const provider = createDeepLTranslationProvider({
      apiKey: 'deepl-key',
      fetchImpl: buildFetchImpl({
        status: 200,
        body: {
          translations: [
            {
              detected_source_language: 'EN',
              text: 'こんにちは',
            },
          ],
        },
      }),
      monotonicClock: clock(),
    });
    const result = await provider.translate({
      text: 'hello',
      sourceLanguage: 'en-US',
      targetLanguage: 'ja-JP',
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.text).toBe('こんにちは');
      expect(result.value.detectedSourceLanguage).toBe('EN');
      expect(result.value.latencyMs).toBe(100);
    }
  });

  it('uses request.sourceLanguage when API does not return detected_source_language', async () => {
    const provider = createDeepLTranslationProvider({
      apiKey: 'deepl-key',
      fetchImpl: buildFetchImpl({
        status: 200,
        body: { translations: [{ text: 'こんにちは' }] },
      }),
    });
    const result = await provider.translate({
      text: 'hello',
      sourceLanguage: 'en-US',
      targetLanguage: 'ja-JP',
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value.detectedSourceLanguage).toBe('en-US');
  });

  it('returns invariant-violation on non-2xx status', async () => {
    const provider = createDeepLTranslationProvider({
      apiKey: 'deepl-key',
      fetchImpl: buildFetchImpl({ status: 403, body: { message: 'forbidden' } }),
    });
    const result = await provider.translate({
      text: 'hello',
      sourceLanguage: 'en-US',
      targetLanguage: 'ja-JP',
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr() && result.error.kind === 'invariant-violation') {
      expect(result.error.invariant).toBe('deepl-http-error');
    }
  });

  it('returns invariant-violation on malformed body', async () => {
    const provider = createDeepLTranslationProvider({
      apiKey: 'deepl-key',
      fetchImpl: buildFetchImpl({ status: 200, body: { translations: [] } }),
    });
    const result = await provider.translate({
      text: 'hello',
      sourceLanguage: null,
      targetLanguage: 'ja-JP',
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr() && result.error.kind === 'invariant-violation') {
      expect(result.error.invariant).toBe('deepl-response-malformed');
    }
  });

  it('returns invariant-violation on fetch network error', async () => {
    const provider = createDeepLTranslationProvider({
      apiKey: 'deepl-key',
      fetchImpl: buildFetchImpl(new Error('ECONNREFUSED')),
    });
    const result = await provider.translate({
      text: 'hello',
      sourceLanguage: 'en-US',
      targetLanguage: 'ja-JP',
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr() && result.error.kind === 'invariant-violation') {
      expect(result.error.invariant).toBe('deepl-fetch-failed');
    }
  });
});
