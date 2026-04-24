import { describe, expect, it } from 'vitest';
import {
  createTranscriptSearchQuery,
  SEARCH_KEYWORD_MAX_LENGTH,
  SEARCH_KEYWORD_MIN_LENGTH,
} from './transcript-search-query';

describe('TranscriptSearchQuery (DD-261, Issue #125)', () => {
  it('accepts a valid query with all fields', () => {
    const result = createTranscriptSearchQuery({
      keyword: 'hello',
      language: 'both',
      caseSensitive: false,
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.keyword).toBe('hello');
      expect(result.value.language).toBe('both');
      expect(result.value.caseSensitive).toBe(false);
    }
  });

  it('accepts source only and target only', () => {
    const source = createTranscriptSearchQuery({
      keyword: 'x',
      language: 'source',
      caseSensitive: false,
    });
    const target = createTranscriptSearchQuery({
      keyword: 'x',
      language: 'target',
      caseSensitive: true,
    });
    expect(source.isOk()).toBe(true);
    expect(target.isOk()).toBe(true);
  });

  it('rejects empty keyword', () => {
    const result = createTranscriptSearchQuery({
      keyword: '',
      language: 'both',
      caseSensitive: false,
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('validation');
  });

  it('rejects keyword longer than 256 chars', () => {
    const result = createTranscriptSearchQuery({
      keyword: 'a'.repeat(SEARCH_KEYWORD_MAX_LENGTH + 1),
      language: 'both',
      caseSensitive: false,
    });
    expect(result.isErr()).toBe(true);
  });

  it('accepts boundary lengths', () => {
    expect(
      createTranscriptSearchQuery({
        keyword: 'a'.repeat(SEARCH_KEYWORD_MIN_LENGTH),
        language: 'both',
        caseSensitive: false,
      }).isOk(),
    ).toBe(true);
    expect(
      createTranscriptSearchQuery({
        keyword: 'a'.repeat(SEARCH_KEYWORD_MAX_LENGTH),
        language: 'both',
        caseSensitive: false,
      }).isOk(),
    ).toBe(true);
  });

  it('rejects invalid language value', () => {
    const result = createTranscriptSearchQuery({
      keyword: 'x',
      language: 'invalid',
      caseSensitive: false,
    });
    expect(result.isErr()).toBe(true);
  });
});
