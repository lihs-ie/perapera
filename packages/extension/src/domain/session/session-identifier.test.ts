import { describe, expect, it } from 'vitest';
import { createSessionIdentifier, parseSessionIdentifier } from './session-identifier.js';

const VALID_ULID = '01HZX8Y1R8M7D3Q2P4T5V6W7X8';

describe('SessionIdentifier', () => {
  it('creates a fresh identifier shaped like ULID', () => {
    const identifier = createSessionIdentifier();
    expect(identifier).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('creates unique identifiers on successive calls', () => {
    const a = createSessionIdentifier();
    const b = createSessionIdentifier();
    expect(a).not.toBe(b);
  });

  it('parses a valid ULID string', () => {
    const result = parseSessionIdentifier(VALID_ULID);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value).toBe(VALID_ULID);
  });

  it('rejects non-ULID string', () => {
    const result = parseSessionIdentifier('not-a-ulid');
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('validation');
  });

  it('rejects empty string', () => {
    expect(parseSessionIdentifier('').isErr()).toBe(true);
  });

  it('rejects non-string value', () => {
    expect(parseSessionIdentifier(123).isErr()).toBe(true);
  });
});
