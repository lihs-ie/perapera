import { describe, expect, it } from 'vitest';

describe('extension smoke', () => {
  it('vitest runs', () => {
    expect(1 + 1).toBe(2);
  });

  it('chrome stub is available', () => {
    expect(globalThis.chrome.runtime.id).toBe('test-extension-id');
  });
});
