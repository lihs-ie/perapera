import { describe, expect, it } from 'vitest';
import { createTimestampRange } from './timestamp-range.js';

describe('TimestampRange', () => {
  it('accepts start < end', () => {
    const result = createTimestampRange({ startMs: 100, endMs: 250 });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.startMs).toBe(100);
      expect(result.value.endMs).toBe(250);
    }
  });

  it('accepts start == end (zero-duration segment)', () => {
    const result = createTimestampRange({ startMs: 100, endMs: 100 });
    expect(result.isOk()).toBe(true);
  });

  it('rejects start > end', () => {
    const result = createTimestampRange({ startMs: 300, endMs: 100 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('validation');
  });

  it('rejects negative offsets', () => {
    const result = createTimestampRange({ startMs: -1, endMs: 100 });
    expect(result.isErr()).toBe(true);
  });

  it('rejects non-integer values', () => {
    const result = createTimestampRange({ startMs: 1.5, endMs: 100 });
    expect(result.isErr()).toBe(true);
  });
});
