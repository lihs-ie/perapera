import { describe, expect, it } from 'vitest';
import { SOURCE_TYPES, parseSourceType } from './source-type.js';

describe('SourceType', () => {
  it('accepts "tab"', () => {
    const result = parseSourceType('tab');
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value).toBe('tab');
  });

  it('accepts "microphone"', () => {
    const result = parseSourceType('microphone');
    expect(result.isOk()).toBe(true);
  });

  it('accepts "desktop"', () => {
    const result = parseSourceType('desktop');
    expect(result.isOk()).toBe(true);
  });

  it('rejects unknown string', () => {
    const result = parseSourceType('unknown');
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('validation');
  });

  it('rejects non-string value', () => {
    const result = parseSourceType(42);
    expect(result.isErr()).toBe(true);
  });

  it('exposes SOURCE_TYPES as the canonical enumeration', () => {
    expect(SOURCE_TYPES).toEqual(['tab', 'microphone', 'desktop']);
  });
});
