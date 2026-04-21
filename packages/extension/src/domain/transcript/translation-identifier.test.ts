import { describe, expect, it } from 'vitest';
import {
  createTranslationIdentifier,
  parseTranslationIdentifier,
} from './translation-identifier.js';

describe('TranslationIdentifier', () => {
  it('creates a ULID-shaped identifier', () => {
    expect(createTranslationIdentifier()).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('parses a valid ULID', () => {
    const result = parseTranslationIdentifier('01HZX8Y1R8M7D3Q2P4T5V6W7X8');
    expect(result.isOk()).toBe(true);
  });

  it('rejects invalid format', () => {
    const result = parseTranslationIdentifier(undefined);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('validation');
  });
});
