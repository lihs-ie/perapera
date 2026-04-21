import { describe, expect, it } from 'vitest';
import { createSegmentIdentifier, parseSegmentIdentifier } from './segment-identifier';

describe('SegmentIdentifier', () => {
  it('creates a ULID-shaped identifier', () => {
    expect(createSegmentIdentifier()).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('parses a valid ULID', () => {
    const result = parseSegmentIdentifier('01HZX8Y1R8M7D3Q2P4T5V6W7X8');
    expect(result.isOk()).toBe(true);
  });

  it('rejects invalid format', () => {
    const result = parseSegmentIdentifier('seg_abc');
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('validation');
  });
});
