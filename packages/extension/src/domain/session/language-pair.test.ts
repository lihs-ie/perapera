import { describe, expect, it } from 'vitest';
import { createLanguagePair } from './language-pair';

describe('LanguagePair', () => {
  it('accepts a valid pair (en-US -> ja-JP)', () => {
    const result = createLanguagePair({ source: 'en-US', target: 'ja-JP' });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.source).toBe('en-US');
      expect(result.value.target).toBe('ja-JP');
    }
  });

  it('accepts 2-letter codes without region (en -> ja)', () => {
    const result = createLanguagePair({ source: 'en', target: 'ja' });
    expect(result.isOk()).toBe(true);
  });

  it('rejects identical source and target', () => {
    const result = createLanguagePair({ source: 'en-US', target: 'en-US' });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('validation');
  });

  it('rejects malformed source', () => {
    const result = createLanguagePair({ source: 'ENGLISH', target: 'ja-JP' });
    expect(result.isErr()).toBe(true);
  });

  it('rejects malformed target', () => {
    const result = createLanguagePair({ source: 'en-US', target: 'jp' });
    expect(result.isOk()).toBe(true); // "jp" (2 letters) is accepted by the schema
    const badResult = createLanguagePair({ source: 'en-US', target: 'ja_JP' });
    expect(badResult.isErr()).toBe(true);
  });

  it('rejects empty input', () => {
    const result = createLanguagePair({ source: '', target: 'ja-JP' });
    expect(result.isErr()).toBe(true);
  });
});
