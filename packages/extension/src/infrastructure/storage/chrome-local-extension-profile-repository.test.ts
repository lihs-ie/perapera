import { beforeEach, describe, expect, it } from 'vitest';
import { createExtensionProfile } from '../../domain/profile/extension-profile';
import { createOverlaySettings } from '../../domain/profile/overlay-settings';
import { createLanguagePair } from '../../domain/session/language-pair';
import { type ChromeStorageAdapter } from './chrome-local-settings-store';
import { createChromeLocalExtensionProfileRepository } from './chrome-local-extension-profile-repository';

const PROFILE_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7C1';

const createFakeStorage = (): ChromeStorageAdapter => {
  const store = new Map<string, unknown>();
  return {
    get: (keys) => {
      const result: Record<string, unknown> = {};
      for (const key of keys) {
        if (store.has(key)) result[key] = store.get(key);
      }
      return Promise.resolve(result);
    },
    set: (items) => {
      for (const [key, value] of Object.entries(items)) {
        store.set(key, value);
      }
      return Promise.resolve();
    },
  };
};

const buildProfile = () =>
  createExtensionProfile({
    profileIdentifier: PROFILE_ID,
    defaultLanguagePair: createLanguagePair({ source: 'en-US', target: 'ja-JP' })._unsafeUnwrap(),
    defaultOverlaySettings: createOverlaySettings({
      positionPreset: 'bottom',
      opacity: 0.8,
      maxLines: 2,
      fontScale: 1,
      showOriginalText: true,
      showTranslatedText: true,
    })._unsafeUnwrap(),
    autoDetectEnabled: false,
  })._unsafeUnwrap();

describe('createChromeLocalExtensionProfileRepository (IMPL-142, DD-262 / DD-107)', () => {
  let storage: ChromeStorageAdapter;

  beforeEach(() => {
    storage = createFakeStorage();
  });

  describe('getDefault', () => {
    it('returns notFound when storage is empty', async () => {
      const repo = createChromeLocalExtensionProfileRepository(storage);
      const result = await repo.getDefault();
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.kind).toBe('not-found');
        if (result.error.kind === 'not-found') {
          expect(result.error.resourceType).toBe('ExtensionProfile');
          expect(result.error.identifier).toBe('default');
        }
      }
    });

    it('returns notFound when profile identifier key is missing but other keys exist', async () => {
      await storage.set({
        'settings.language.defaultLanguagePair': { source: 'en-US', target: 'ja-JP' },
        'settings.overlay.defaultOverlaySettings': {
          positionPreset: 'bottom',
          opacity: 0.8,
          maxLines: 2,
          fontScale: 1,
          showOriginalText: true,
          showTranslatedText: true,
        },
        'settings.language.autoDetectEnabled': false,
      });
      const repo = createChromeLocalExtensionProfileRepository(storage);
      const result = await repo.getDefault();
      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.kind).toBe('not-found');
    });
  });

  describe('save + getDefault round trip', () => {
    it('persists and retrieves the aggregate', async () => {
      const repo = createChromeLocalExtensionProfileRepository(storage);
      const profile = buildProfile();
      const saveResult = await repo.save(profile);
      expect(saveResult.isOk()).toBe(true);

      const getResult = await repo.getDefault();
      expect(getResult.isOk()).toBe(true);
      if (getResult.isOk()) {
        expect(getResult.value.profileIdentifier).toBe(PROFILE_ID);
        expect(getResult.value.defaultLanguagePair.source).toBe('en-US');
        expect(getResult.value.defaultLanguagePair.target).toBe('ja-JP');
        expect(getResult.value.defaultOverlaySettings.opacity).toBe(0.8);
        expect(getResult.value.autoDetectEnabled).toBe(false);
      }
    });

    it('upserts when save is called twice', async () => {
      const repo = createChromeLocalExtensionProfileRepository(storage);
      await repo.save(buildProfile());

      const updated = createExtensionProfile({
        profileIdentifier: PROFILE_ID,
        defaultLanguagePair: createLanguagePair({
          source: 'en-US',
          target: 'ja-JP',
        })._unsafeUnwrap(),
        defaultOverlaySettings: createOverlaySettings({
          positionPreset: 'top',
          opacity: 0.5,
          maxLines: 3,
          fontScale: 1.2,
          showOriginalText: false,
          showTranslatedText: true,
        })._unsafeUnwrap(),
        autoDetectEnabled: true,
      })._unsafeUnwrap();
      await repo.save(updated);

      const result = await repo.getDefault();
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.defaultOverlaySettings.positionPreset).toBe('top');
        expect(result.value.defaultOverlaySettings.maxLines).toBe(3);
        expect(result.value.autoDetectEnabled).toBe(true);
      }
    });
  });

  describe('interop with ChromeLocalSettingsStore keys', () => {
    it('writes keys that ChromeLocalSettingsStore can read back', async () => {
      const repo = createChromeLocalExtensionProfileRepository(storage);
      await repo.save(buildProfile());
      // Verify the individual keys are present in the same shape
      // ChromeLocalSettingsStore expects.
      const raw = await storage.get([
        'settings.language.defaultLanguagePair',
        'settings.overlay.defaultOverlaySettings',
        'settings.language.autoDetectEnabled',
        'settings.profile.identifier',
      ]);
      expect(raw['settings.language.defaultLanguagePair']).toEqual({
        source: 'en-US',
        target: 'ja-JP',
      });
      expect(raw['settings.language.autoDetectEnabled']).toBe(false);
      expect(raw['settings.profile.identifier']).toBe(PROFILE_ID);
      expect(raw['settings.overlay.defaultOverlaySettings']).toMatchObject({
        positionPreset: 'bottom',
        opacity: 0.8,
      });
    });
  });
});
