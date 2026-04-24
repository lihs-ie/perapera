import { describe, expect, it } from 'vitest';
import { applyGlossaryPostProcess } from './glossary-post-process';

describe('applyGlossaryPostProcess (Issue #123)', () => {
  it('returns original text when glossary is empty', () => {
    const result = applyGlossaryPostProcess('Hello world', []);
    expect(result).toBe('Hello world');
  });

  it('replaces source with target (case-sensitive, exact match)', () => {
    const result = applyGlossaryPostProcess('API is great', [
      { source: 'API', target: 'インターフェース', caseSensitive: true },
    ]);
    expect(result).toBe('インターフェース is great');
  });

  it('does not replace a different-case match when caseSensitive=true', () => {
    const result = applyGlossaryPostProcess('api is great', [
      { source: 'API', target: 'インターフェース', caseSensitive: true },
    ]);
    expect(result).toBe('api is great');
  });

  it('replaces case-insensitive when caseSensitive=false', () => {
    const result = applyGlossaryPostProcess('The api is great', [
      { source: 'API', target: 'X', caseSensitive: false },
    ]);
    expect(result).toBe('The X is great');
  });

  it('respects word boundaries for ASCII source (does not replace within a word)', () => {
    const result = applyGlossaryPostProcess('APIs are numerous', [
      { source: 'API', target: 'X', caseSensitive: true },
    ]);
    expect(result).toBe('APIs are numerous');
  });

  it('replaces ASCII source at word boundaries multiple times', () => {
    const result = applyGlossaryPostProcess('API, API!', [
      { source: 'API', target: 'X', caseSensitive: true },
    ]);
    expect(result).toBe('X, X!');
  });

  it('replaces non-ASCII source as plain substring (no word boundary enforcement)', () => {
    // 日本語のテキストには \b で単語境界を取れないため plain substring 一致
    const result = applyGlossaryPostProcess('機械学習は面白い', [
      { source: '機械学習', target: 'ML', caseSensitive: true },
    ]);
    expect(result).toBe('MLは面白い');
  });

  it('applies entries sequentially in given order', () => {
    const result = applyGlossaryPostProcess('API SDK', [
      { source: 'API', target: '<1>', caseSensitive: true },
      { source: 'SDK', target: '<2>', caseSensitive: true },
    ]);
    expect(result).toBe('<1> <2>');
  });

  it('escapes regex special characters in source', () => {
    const result = applyGlossaryPostProcess('use C++ here', [
      { source: 'C++', target: 'C plus plus', caseSensitive: true },
    ]);
    expect(result).toBe('use C plus plus here');
  });

  it('escapes regex special characters in target', () => {
    const result = applyGlossaryPostProcess('use API', [
      { source: 'API', target: '$1 special', caseSensitive: true },
    ]);
    expect(result).toBe('use $1 special');
  });

  it('handles empty text', () => {
    const result = applyGlossaryPostProcess('', [
      { source: 'API', target: 'X', caseSensitive: true },
    ]);
    expect(result).toBe('');
  });

  it('combines ASCII and non-ASCII entries', () => {
    const result = applyGlossaryPostProcess('機械学習の API は最高', [
      { source: '機械学習', target: 'ML', caseSensitive: true },
      { source: 'API', target: 'インターフェース', caseSensitive: true },
    ]);
    expect(result).toBe('MLの インターフェース は最高');
  });

  it('respects ASCII case-insensitive word boundary', () => {
    const result = applyGlossaryPostProcess('myAPI uses api', [
      { source: 'api', target: 'インターフェース', caseSensitive: false },
    ]);
    // 'myAPI' は word boundary で保護、'api' のみ置換
    expect(result).toBe('myAPI uses インターフェース');
  });
});
