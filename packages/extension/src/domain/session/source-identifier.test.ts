import { describe, expect, it } from 'vitest';
import { createSourceIdentifier, parseSourceIdentifier } from './source-identifier.js';

const VALID_ULID = '01HZX8Y1R8M7D3Q2P4T5V6W7X8';

describe('SourceIdentifier', () => {
  it('creates a fresh identifier shaped like ULID', () => {
    const identifier = createSourceIdentifier();
    expect(identifier).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('parses a valid ULID', () => {
    const result = parseSourceIdentifier(VALID_ULID);
    expect(result.isOk()).toBe(true);
  });

  it('rejects invalid string', () => {
    const result = parseSourceIdentifier('src_not_ulid');
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('validation');
  });

  it('rejects non-string value', () => {
    expect(parseSourceIdentifier(null).isErr()).toBe(true);
  });
});
