import { errAsync, okAsync } from 'neverthrow';
import { describe, expect, it } from 'vitest';
import { createOverlaySettings, type OverlaySettings } from '../../domain/profile/overlay-settings';
import { createLanguagePair, type LanguagePair } from '../../domain/session/language-pair';
import { notFoundError, type DomainError } from '../../domain/shared/errors';
import { type SettingsStore } from './settings-store';

const buildLanguagePair = (): LanguagePair =>
  createLanguagePair({ source: 'en-US', target: 'ja-JP' })._unsafeUnwrap();

const buildOverlaySettings = (): OverlaySettings =>
  createOverlaySettings({
    positionPreset: 'bottom',
    opacity: 0.8,
    maxLines: 2,
    fontScale: 1,
    showOriginalText: true,
    showTranslatedText: true,
  })._unsafeUnwrap();

describe('SettingsStore (DD-107)', () => {
  describe('type contract', () => {
    it('accepts an object literal that implements all four required methods', () => {
      const mock: SettingsStore = {
        getDefaultLanguagePair: () => okAsync(buildLanguagePair()),
        saveDefaultLanguagePair: () => okAsync(undefined),
        getDefaultOverlaySettings: () => okAsync(buildOverlaySettings()),
        saveDefaultOverlaySettings: () => okAsync(undefined),
        getRelayConnectionOverride: () => okAsync(null),
        saveRelayConnectionOverride: () => okAsync(undefined),
        clearRelayConnectionOverride: () => okAsync(undefined),
      };
      expect(typeof mock.getDefaultLanguagePair).toBe('function');
      expect(typeof mock.saveDefaultLanguagePair).toBe('function');
      expect(typeof mock.getDefaultOverlaySettings).toBe('function');
      expect(typeof mock.saveDefaultOverlaySettings).toBe('function');
    });
  });

  describe('getDefaultLanguagePair', () => {
    it('returns stored LanguagePair on success', async () => {
      const pair = buildLanguagePair();
      const mock: SettingsStore = {
        getDefaultLanguagePair: () => okAsync(pair),
        saveDefaultLanguagePair: () => okAsync(undefined),
        getDefaultOverlaySettings: () => okAsync(buildOverlaySettings()),
        saveDefaultOverlaySettings: () => okAsync(undefined),
        getRelayConnectionOverride: () => okAsync(null),
        saveRelayConnectionOverride: () => okAsync(undefined),
        clearRelayConnectionOverride: () => okAsync(undefined),
      };
      const result = await mock.getDefaultLanguagePair();
      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value).toBe(pair);
    });

    it('returns notFoundError when uninitialized', async () => {
      const mock: SettingsStore = {
        getDefaultLanguagePair: () =>
          errAsync<LanguagePair, DomainError>(
            notFoundError({ resourceType: 'LanguagePair', identifier: 'default' }),
          ),
        saveDefaultLanguagePair: () => okAsync(undefined),
        getDefaultOverlaySettings: () => okAsync(buildOverlaySettings()),
        saveDefaultOverlaySettings: () => okAsync(undefined),
        getRelayConnectionOverride: () => okAsync(null),
        saveRelayConnectionOverride: () => okAsync(undefined),
        clearRelayConnectionOverride: () => okAsync(undefined),
      };
      const result = await mock.getDefaultLanguagePair();
      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.kind).toBe('not-found');
    });
  });

  describe('saveDefaultOverlaySettings', () => {
    it('resolves to ok(void) on success (upsert semantics)', async () => {
      const mock: SettingsStore = {
        getDefaultLanguagePair: () => okAsync(buildLanguagePair()),
        saveDefaultLanguagePair: () => okAsync(undefined),
        getDefaultOverlaySettings: () => okAsync(buildOverlaySettings()),
        saveDefaultOverlaySettings: () => okAsync(undefined),
        getRelayConnectionOverride: () => okAsync(null),
        saveRelayConnectionOverride: () => okAsync(undefined),
        clearRelayConnectionOverride: () => okAsync(undefined),
      };
      const result = await mock.saveDefaultOverlaySettings(buildOverlaySettings());
      expect(result.isOk()).toBe(true);
    });
  });
});
