import { describe, expect, it } from 'vitest';
import { createGlossary, createGlossaryEntry, EMPTY_GLOSSARY } from './glossary';

describe('GlossaryEntry', () => {
  it('accepts a valid entry with caseSensitive=true', () => {
    const result = createGlossaryEntry({
      source: 'API',
      target: 'アプリケーションプログラミングインターフェース',
      caseSensitive: true,
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.source).toBe('API');
      expect(result.value.target).toBe('アプリケーションプログラミングインターフェース');
      expect(result.value.caseSensitive).toBe(true);
    }
  });

  it('accepts a valid entry with caseSensitive=false', () => {
    const result = createGlossaryEntry({
      source: 'kubernetes',
      target: 'クーバーネティス',
      caseSensitive: false,
    });
    expect(result.isOk()).toBe(true);
  });

  it('rejects empty source', () => {
    const result = createGlossaryEntry({ source: '', target: 'X', caseSensitive: false });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('validation');
  });

  it('rejects empty target', () => {
    const result = createGlossaryEntry({ source: 'X', target: '', caseSensitive: false });
    expect(result.isErr()).toBe(true);
  });

  it('rejects source longer than 64 characters', () => {
    const result = createGlossaryEntry({
      source: 'a'.repeat(65),
      target: 'X',
      caseSensitive: false,
    });
    expect(result.isErr()).toBe(true);
  });

  it('rejects target longer than 64 characters', () => {
    const result = createGlossaryEntry({
      source: 'X',
      target: 'a'.repeat(65),
      caseSensitive: false,
    });
    expect(result.isErr()).toBe(true);
  });

  it('accepts exactly 64-character source and target', () => {
    const result = createGlossaryEntry({
      source: 'a'.repeat(64),
      target: 'b'.repeat(64),
      caseSensitive: false,
    });
    expect(result.isOk()).toBe(true);
  });

  it('rejects source equal to target (case-sensitive comparison)', () => {
    const result = createGlossaryEntry({
      source: 'API',
      target: 'API',
      caseSensitive: true,
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('validation');
  });

  it('accepts source and target differing only by case', () => {
    const result = createGlossaryEntry({
      source: 'api',
      target: 'API',
      caseSensitive: true,
    });
    expect(result.isOk()).toBe(true);
  });

  it('rejects non-boolean caseSensitive', () => {
    const result = createGlossaryEntry({
      source: 'X',
      target: 'Y',
      caseSensitive: 'yes',
    });
    expect(result.isErr()).toBe(true);
  });
});

describe('Glossary', () => {
  it('accepts an empty glossary', () => {
    const result = createGlossary({ entries: [] });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value.entries).toHaveLength(0);
  });

  it('EMPTY_GLOSSARY constant is a branded empty glossary', () => {
    expect(EMPTY_GLOSSARY.entries).toHaveLength(0);
  });

  it('accepts a glossary with one valid entry', () => {
    const result = createGlossary({
      entries: [{ source: 'API', target: 'インターフェース', caseSensitive: true }],
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.entries).toHaveLength(1);
      expect(result.value.entries[0]?.source).toBe('API');
    }
  });

  it('accepts 200 entries (boundary)', () => {
    const entries = Array.from({ length: 200 }, (_, i) => ({
      source: `term${i}`,
      target: `訳${i}`,
      caseSensitive: false,
    }));
    const result = createGlossary({ entries });
    expect(result.isOk()).toBe(true);
  });

  it('rejects 201 entries', () => {
    const entries = Array.from({ length: 201 }, (_, i) => ({
      source: `term${i}`,
      target: `訳${i}`,
      caseSensitive: false,
    }));
    const result = createGlossary({ entries });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('validation');
  });

  it('rejects duplicate source entries (exact match)', () => {
    const result = createGlossary({
      entries: [
        { source: 'API', target: 'インターフェース', caseSensitive: true },
        { source: 'API', target: '別の訳', caseSensitive: false },
      ],
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('validation');
  });

  it('accepts entries with same source text but different casing (case-sensitive uniqueness)', () => {
    const result = createGlossary({
      entries: [
        { source: 'API', target: 'インターフェース', caseSensitive: true },
        { source: 'api', target: '別の訳', caseSensitive: false },
      ],
    });
    expect(result.isOk()).toBe(true);
  });

  it('rejects entry with invalid shape', () => {
    const result = createGlossary({
      entries: [{ source: '', target: 'X', caseSensitive: false }],
    });
    expect(result.isErr()).toBe(true);
  });

  it('rejects missing entries field', () => {
    const result = createGlossary({});
    expect(result.isErr()).toBe(true);
  });

  it('rejects entries that is not an array', () => {
    const result = createGlossary({ entries: 'not an array' });
    expect(result.isErr()).toBe(true);
  });
});
