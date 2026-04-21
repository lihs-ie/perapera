import { describe, expect, it } from 'vitest';
import { parseStreamTokenIdentifier } from './stream-token-identifier';

describe('parseStreamTokenIdentifier', () => {
  it('accepts strm_<ULID> form', () => {
    const result = parseStreamTokenIdentifier('strm_01HZX8Y1R8M7D3Q2P4T5V6W7A1');
    expect(result.isOk()).toBe(true);
  });

  it('rejects identifiers without prefix', () => {
    const result = parseStreamTokenIdentifier('01HZX8Y1R8M7D3Q2P4T5V6W7A1');
    expect(result.isErr()).toBe(true);
  });

  it('rejects identifiers with wrong prefix', () => {
    const result = parseStreamTokenIdentifier('sess_01HZX8Y1R8M7D3Q2P4T5V6W7A1');
    expect(result.isErr()).toBe(true);
  });

  it('rejects non-string values', () => {
    const result = parseStreamTokenIdentifier(null);
    expect(result.isErr()).toBe(true);
  });
});
