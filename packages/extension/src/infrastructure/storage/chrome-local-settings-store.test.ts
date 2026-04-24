import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGlossary } from '../../domain/glossary';
import { createOverlaySettings } from '../../domain/profile/overlay-settings';
import { createLanguagePair } from '../../domain/session/language-pair';
import {
  createChromeLocalSettingsStore,
  type ChromeStorageAdapter,
} from './chrome-local-settings-store';

const LANGUAGE_KEY = 'settings.language.defaultLanguagePair';
const OVERLAY_KEY = 'settings.overlay.defaultOverlaySettings';
const GLOSSARY_KEY = 'settings.glossary.defaultGlossary';

type MockAdapter = ChromeStorageAdapter & {
  get: ReturnType<typeof vi.fn<ChromeStorageAdapter['get']>>;
  set: ReturnType<typeof vi.fn<ChromeStorageAdapter['set']>>;
  remove: ReturnType<typeof vi.fn<ChromeStorageAdapter['remove']>>;
};

const buildAdapter = (): MockAdapter => {
  const get = vi.fn<ChromeStorageAdapter['get']>(() => Promise.resolve({}));
  const set = vi.fn<ChromeStorageAdapter['set']>(() => Promise.resolve());
  const remove = vi.fn<ChromeStorageAdapter['remove']>(() => Promise.resolve());
  return { get, set, remove };
};

describe('createChromeLocalSettingsStore (IMPL-311, DD-107 / DB-005)', () => {
  let adapter: MockAdapter;

  beforeEach(() => {
    adapter = buildAdapter();
  });

  describe('getDefaultLanguagePair', () => {
    it('returns LanguagePair when valid row exists', async () => {
      adapter.get.mockResolvedValue({
        [LANGUAGE_KEY]: { source: 'en-US', target: 'ja-JP' },
      });
      const store = createChromeLocalSettingsStore(adapter);
      const result = await store.getDefaultLanguagePair();
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.source).toBe('en-US');
        expect(result.value.target).toBe('ja-JP');
      }
    });

    it('returns notFoundError when key is missing', async () => {
      adapter.get.mockResolvedValue({});
      const store = createChromeLocalSettingsStore(adapter);
      const result = await store.getDefaultLanguagePair();
      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.kind).toBe('not-found');
    });

    it('returns validation error when stored value is malformed', async () => {
      adapter.get.mockResolvedValue({
        [LANGUAGE_KEY]: { source: 'ja-JP', target: 'ja-JP' },
      });
      const store = createChromeLocalSettingsStore(adapter);
      const result = await store.getDefaultLanguagePair();
      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.kind).toBe('validation');
    });

    it('returns invariant-violation when chrome.storage rejects', async () => {
      adapter.get.mockRejectedValue(new Error('quota exceeded'));
      const store = createChromeLocalSettingsStore(adapter);
      const result = await store.getDefaultLanguagePair();
      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.kind).toBe('invariant-violation');
    });
  });

  describe('saveDefaultLanguagePair', () => {
    it('writes a primitive payload and resolves ok', async () => {
      const store = createChromeLocalSettingsStore(adapter);
      const pair = createLanguagePair({ source: 'en-US', target: 'ja-JP' })._unsafeUnwrap();
      const result = await store.saveDefaultLanguagePair(pair);
      expect(result.isOk()).toBe(true);
      expect(adapter.set).toHaveBeenCalledWith({
        [LANGUAGE_KEY]: { source: 'en-US', target: 'ja-JP' },
      });
    });

    it('returns invariant-violation when storage write fails', async () => {
      adapter.set.mockRejectedValue(new Error('quota exceeded'));
      const store = createChromeLocalSettingsStore(adapter);
      const pair = createLanguagePair({ source: 'en-US', target: 'ja-JP' })._unsafeUnwrap();
      const result = await store.saveDefaultLanguagePair(pair);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.kind).toBe('invariant-violation');
    });
  });

  describe('getDefaultOverlaySettings', () => {
    it('returns OverlaySettings when valid row exists', async () => {
      adapter.get.mockResolvedValue({
        [OVERLAY_KEY]: {
          positionPreset: 'bottom',
          opacity: 0.8,
          maxLines: 3,
          fontScale: 1.2,
          showOriginalText: true,
          showTranslatedText: false,
        },
      });
      const store = createChromeLocalSettingsStore(adapter);
      const result = await store.getDefaultOverlaySettings();
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.opacity).toBe(0.8);
        expect(result.value.maxLines).toBe(3);
      }
    });

    it('returns notFoundError when key is missing', async () => {
      adapter.get.mockResolvedValue({});
      const store = createChromeLocalSettingsStore(adapter);
      const result = await store.getDefaultOverlaySettings();
      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.kind).toBe('not-found');
    });

    it('returns validation error when stored value violates OverlaySettings schema', async () => {
      adapter.get.mockResolvedValue({
        [OVERLAY_KEY]: {
          positionPreset: 'bottom',
          opacity: 1.5,
          maxLines: 2,
          fontScale: 1,
          showOriginalText: true,
          showTranslatedText: true,
        },
      });
      const store = createChromeLocalSettingsStore(adapter);
      const result = await store.getDefaultOverlaySettings();
      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.kind).toBe('validation');
    });
  });

  describe('saveDefaultOverlaySettings', () => {
    it('writes a primitive payload and resolves ok', async () => {
      const store = createChromeLocalSettingsStore(adapter);
      const settings = createOverlaySettings({
        positionPreset: 'bottom',
        opacity: 0.8,
        maxLines: 2,
        fontScale: 1,
        showOriginalText: true,
        showTranslatedText: true,
      })._unsafeUnwrap();
      const result = await store.saveDefaultOverlaySettings(settings);
      expect(result.isOk()).toBe(true);
      const lastCall = adapter.set.mock.calls[0]?.[0];
      expect(lastCall).toHaveProperty(OVERLAY_KEY);
    });
  });

  describe('getDefaultGlossary', () => {
    it('returns Glossary when valid row exists', async () => {
      adapter.get.mockResolvedValue({
        [GLOSSARY_KEY]: {
          entries: [
            { source: 'API', target: 'インターフェース', caseSensitive: true },
            { source: 'SDK', target: '開発キット', caseSensitive: false },
          ],
        },
      });
      const store = createChromeLocalSettingsStore(adapter);
      const result = await store.getDefaultGlossary();
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.entries).toHaveLength(2);
        expect(result.value.entries[0]?.source).toBe('API');
      }
    });

    it('returns Glossary for empty entries array', async () => {
      adapter.get.mockResolvedValue({
        [GLOSSARY_KEY]: { entries: [] },
      });
      const store = createChromeLocalSettingsStore(adapter);
      const result = await store.getDefaultGlossary();
      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value.entries).toHaveLength(0);
    });

    it('returns notFoundError when key is missing', async () => {
      adapter.get.mockResolvedValue({});
      const store = createChromeLocalSettingsStore(adapter);
      const result = await store.getDefaultGlossary();
      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.kind).toBe('not-found');
    });

    it('returns validation error when stored value violates Glossary schema (duplicate sources)', async () => {
      adapter.get.mockResolvedValue({
        [GLOSSARY_KEY]: {
          entries: [
            { source: 'API', target: 'X', caseSensitive: true },
            { source: 'API', target: 'Y', caseSensitive: false },
          ],
        },
      });
      const store = createChromeLocalSettingsStore(adapter);
      const result = await store.getDefaultGlossary();
      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.kind).toBe('validation');
    });

    it('returns invariant-violation when chrome.storage rejects', async () => {
      adapter.get.mockRejectedValue(new Error('quota exceeded'));
      const store = createChromeLocalSettingsStore(adapter);
      const result = await store.getDefaultGlossary();
      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.kind).toBe('invariant-violation');
    });
  });

  describe('saveDefaultGlossary', () => {
    it('writes a primitive payload and resolves ok', async () => {
      const store = createChromeLocalSettingsStore(adapter);
      const glossary = createGlossary({
        entries: [{ source: 'API', target: 'インターフェース', caseSensitive: true }],
      })._unsafeUnwrap();
      const result = await store.saveDefaultGlossary(glossary);
      expect(result.isOk()).toBe(true);
      expect(adapter.set).toHaveBeenCalledWith({
        [GLOSSARY_KEY]: {
          entries: [{ source: 'API', target: 'インターフェース', caseSensitive: true }],
        },
      });
    });

    it('returns invariant-violation when storage write fails', async () => {
      adapter.set.mockRejectedValue(new Error('quota exceeded'));
      const store = createChromeLocalSettingsStore(adapter);
      const glossary = createGlossary({ entries: [] })._unsafeUnwrap();
      const result = await store.saveDefaultGlossary(glossary);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.kind).toBe('invariant-violation');
    });
  });
});
