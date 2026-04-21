import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createOverlaySettings } from '../../domain/profile/overlay-settings';
import { createLanguagePair } from '../../domain/session/language-pair';
import {
  createChromeLocalSettingsStore,
  type ChromeStorageAdapter,
} from './chrome-local-settings-store';

const LANGUAGE_KEY = 'settings.language.defaultLanguagePair';
const OVERLAY_KEY = 'settings.overlay.defaultOverlaySettings';

type MockAdapter = ChromeStorageAdapter & {
  get: ReturnType<typeof vi.fn<ChromeStorageAdapter['get']>>;
  set: ReturnType<typeof vi.fn<ChromeStorageAdapter['set']>>;
};

const buildAdapter = (): MockAdapter => {
  const get = vi.fn<ChromeStorageAdapter['get']>(() => Promise.resolve({}));
  const set = vi.fn<ChromeStorageAdapter['set']>(() => Promise.resolve());
  return { get, set };
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
});
