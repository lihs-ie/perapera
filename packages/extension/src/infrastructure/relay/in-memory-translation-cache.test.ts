import { describe, expect, it } from 'vitest';
import {
  createInMemoryTranslationCache,
  DEFAULT_TRANSLATION_CACHE_TTL_MS,
  type TranslationCacheEntry,
} from './in-memory-translation-cache';

const entry: TranslationCacheEntry = {
  targetLanguage: 'ja-JP',
  text: 'こんにちは',
};

describe('createInMemoryTranslationCache (IMPL-322, DD-133)', () => {
  it('returns null for a missing key', () => {
    const cache = createInMemoryTranslationCache({ clock: () => 0 });
    expect(cache.get('missing')).toBeNull();
    expect(cache.has('missing')).toBe(false);
  });

  it('returns the stored entry while within TTL', () => {
    let now = 1000;
    const cache = createInMemoryTranslationCache({ clock: () => now });
    cache.set('k1', entry);
    now += DEFAULT_TRANSLATION_CACHE_TTL_MS - 1;
    expect(cache.get('k1')).toEqual(entry);
    expect(cache.has('k1')).toBe(true);
  });

  it('evicts an entry exactly at TTL boundary', () => {
    let now = 1000;
    const cache = createInMemoryTranslationCache({ clock: () => now });
    cache.set('k1', entry);
    now += DEFAULT_TRANSLATION_CACHE_TTL_MS;
    expect(cache.get('k1')).toBeNull();
    expect(cache.has('k1')).toBe(false);
  });

  it('overwrites an existing key and resets TTL', () => {
    let now = 0;
    const cache = createInMemoryTranslationCache({ clock: () => now });
    cache.set('k1', entry);
    now += 25000;
    cache.set('k1', { targetLanguage: 'ja-JP', text: 'こんばんは' });
    now += 25000; // total 50000 from first set, but second reset it at 25000
    expect(cache.get('k1')?.text).toBe('こんばんは');
  });

  it('clear() removes all entries', () => {
    const cache = createInMemoryTranslationCache({ clock: () => 0 });
    cache.set('a', entry);
    cache.set('b', entry);
    cache.clear();
    expect(cache.has('a')).toBe(false);
    expect(cache.has('b')).toBe(false);
  });

  it('accepts a custom ttlMs override', () => {
    let now = 0;
    const cache = createInMemoryTranslationCache({ clock: () => now, ttlMs: 1000 });
    cache.set('k', entry);
    now += 500;
    expect(cache.has('k')).toBe(true);
    now += 500;
    expect(cache.has('k')).toBe(false);
  });

  it('DEFAULT_TRANSLATION_CACHE_TTL_MS is 30000ms (30 seconds per DD-133)', () => {
    expect(DEFAULT_TRANSLATION_CACHE_TTL_MS).toBe(30000);
  });

  it('requires clock dependency (compile-time: must be provided)', () => {
    // This test documents that `clock` is a required field in the
    // dependencies. Production code must pass `() => Date.now()` explicitly
    // via entrypoint wiring (no default to prevent mock leakage).
    const cache = createInMemoryTranslationCache({ clock: () => 12345 });
    expect(cache).toBeDefined();
  });
});
