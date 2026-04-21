import { describe, expect, it } from 'vitest';
import { createLanguagePair } from '../session/language-pair.js';
import {
  createExtensionProfile,
  updateDefaultLanguagePair,
  updateDefaultOverlaySettings,
  toggleAutoDetect,
} from './extension-profile.js';
import { createOverlaySettings } from './overlay-settings.js';

const PROFILE_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7X8';
const defaultLanguagePair = createLanguagePair({
  source: 'en-US',
  target: 'ja-JP',
})._unsafeUnwrap();
const defaultOverlaySettings = createOverlaySettings({
  positionPreset: 'bottom',
  opacity: 0.85,
  maxLines: 2,
  fontScale: 1,
  showOriginalText: true,
  showTranslatedText: true,
})._unsafeUnwrap();

const newProfile = () =>
  createExtensionProfile({
    profileIdentifier: PROFILE_ID,
    defaultLanguagePair,
    defaultOverlaySettings,
    autoDetectEnabled: false,
  })._unsafeUnwrap();

describe('ExtensionProfile aggregate', () => {
  describe('createExtensionProfile', () => {
    it('creates a profile with given defaults', () => {
      const result = createExtensionProfile({
        profileIdentifier: PROFILE_ID,
        defaultLanguagePair,
        defaultOverlaySettings,
        autoDetectEnabled: false,
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.autoDetectEnabled).toBe(false);
      }
    });

    it('rejects invalid profileIdentifier', () => {
      const result = createExtensionProfile({
        profileIdentifier: 'bad',
        defaultLanguagePair,
        defaultOverlaySettings,
        autoDetectEnabled: false,
      });
      expect(result.isErr()).toBe(true);
    });
  });

  describe('updateDefaultLanguagePair', () => {
    it('replaces the default language pair', () => {
      const newPair = createLanguagePair({ source: 'ja-JP', target: 'en-US' })._unsafeUnwrap();
      const result = updateDefaultLanguagePair(newProfile(), newPair);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value.defaultLanguagePair).toBe(newPair);
    });
  });

  describe('updateDefaultOverlaySettings', () => {
    it('replaces the default overlay settings', () => {
      const newSettings = createOverlaySettings({
        positionPreset: 'top',
        opacity: 1,
        maxLines: 3,
        fontScale: 1.2,
        showOriginalText: false,
        showTranslatedText: true,
      })._unsafeUnwrap();
      const result = updateDefaultOverlaySettings(newProfile(), newSettings);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value.defaultOverlaySettings).toBe(newSettings);
    });
  });

  describe('toggleAutoDetect', () => {
    it('sets autoDetectEnabled to the requested value', () => {
      const enabled = toggleAutoDetect(newProfile(), true);
      expect(enabled.isOk()).toBe(true);
      if (enabled.isOk()) expect(enabled.value.autoDetectEnabled).toBe(true);

      const disabled = toggleAutoDetect(enabled._unsafeUnwrap(), false);
      expect(disabled.isOk()).toBe(true);
      if (disabled.isOk()) expect(disabled.value.autoDetectEnabled).toBe(false);
    });
  });
});
