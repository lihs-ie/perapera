import { describe, expect, it } from 'vitest';
import { createGlossary, EMPTY_GLOSSARY } from './glossary';

describe('Glossary (DD-238, relay-api)', () => {
  it('accepts empty entries', () => {
    const result = createGlossary({ entries: [] });
    expect(result.isOk()).toBe(true);
  });

  it('EMPTY_GLOSSARY is a valid empty glossary', () => {
    expect(EMPTY_GLOSSARY.entries).toHaveLength(0);
  });

  it('accepts up to 200 entries', () => {
    const entries = Array.from({ length: 200 }, (_, i) => ({
      source: `t${i}`,
      target: `訳${i}`,
      caseSensitive: false,
    }));
    const result = createGlossary({ entries });
    expect(result.isOk()).toBe(true);
  });

  it('rejects 201 entries', () => {
    const entries = Array.from({ length: 201 }, (_, i) => ({
      source: `t${i}`,
      target: `訳${i}`,
      caseSensitive: false,
    }));
    const result = createGlossary({ entries });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('validation');
  });

  it('rejects duplicate sources', () => {
    const result = createGlossary({
      entries: [
        { source: 'API', target: 'X', caseSensitive: true },
        { source: 'API', target: 'Y', caseSensitive: false },
      ],
    });
    expect(result.isErr()).toBe(true);
  });

  it('rejects entry with source == target', () => {
    const result = createGlossary({
      entries: [{ source: 'API', target: 'API', caseSensitive: true }],
    });
    expect(result.isErr()).toBe(true);
  });

  it('rejects entry with empty source', () => {
    const result = createGlossary({
      entries: [{ source: '', target: 'X', caseSensitive: false }],
    });
    expect(result.isErr()).toBe(true);
  });
});
