import { describe, expect, it } from 'vitest';
import { parseSessionIdentifier } from './session-identifier';

describe('parseSessionIdentifier', () => {
  it('accepts a valid ULID', () => {
    const result = parseSessionIdentifier('01HZX8Y1R8M7D3Q2P4T5V6W7A1');
    expect(result.isOk()).toBe(true);
  });

  it('accepts lowercase ULIDs', () => {
    const result = parseSessionIdentifier('01hzx8y1r8m7d3q2p4t5v6w7a1');
    expect(result.isOk()).toBe(true);
  });

  it('rejects non-ULID strings', () => {
    const result = parseSessionIdentifier('not-a-ulid');
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('validation');
  });

  it('rejects strings shorter than 26 chars', () => {
    const result = parseSessionIdentifier('01HZX8Y1R8');
    expect(result.isErr()).toBe(true);
  });

  it('rejects non-string values', () => {
    const result = parseSessionIdentifier(123);
    expect(result.isErr()).toBe(true);
  });
});
