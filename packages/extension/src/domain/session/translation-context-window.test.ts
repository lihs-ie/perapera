import { describe, expect, it } from 'vitest';
import {
  createTranslationContextWindow,
  DEFAULT_TRANSLATION_CONTEXT_WINDOW,
} from './translation-context-window';

describe('TranslationContextWindow (DD-237)', () => {
  it('accepts values within allowed ranges', () => {
    const result = createTranslationContextWindow({
      maxSegments: 3,
      includeTranslatedText: true,
    });
    expect(result.isOk()).toBe(true);
  });

  it('accepts maxSegments=0 (no context)', () => {
    const result = createTranslationContextWindow({
      maxSegments: 0,
      includeTranslatedText: false,
    });
    expect(result.isOk()).toBe(true);
  });

  it('accepts maxSegments=5 (upper bound)', () => {
    const result = createTranslationContextWindow({
      maxSegments: 5,
      includeTranslatedText: true,
    });
    expect(result.isOk()).toBe(true);
  });

  it.each([
    ['maxSegments below lower bound', -1, true],
    ['maxSegments above upper bound', 6, true],
    ['non-integer maxSegments', 2.5, true],
  ])('rejects %s', (_label, maxSegments, includeTranslatedText) => {
    const result = createTranslationContextWindow({
      maxSegments,
      includeTranslatedText,
    });
    expect(result.isErr()).toBe(true);
  });

  it('rejects non-boolean includeTranslatedText', () => {
    const result = createTranslationContextWindow({
      maxSegments: 3,
      includeTranslatedText: 'yes',
    });
    expect(result.isErr()).toBe(true);
  });

  it('exposes the REQ-NF-019 recommended defaults', () => {
    expect(DEFAULT_TRANSLATION_CONTEXT_WINDOW.maxSegments).toBe(3);
    expect(DEFAULT_TRANSLATION_CONTEXT_WINDOW.includeTranslatedText).toBe(true);
  });
});
