import { describe, expect, it } from 'vitest';
import { createExtensionProfile, type ExtensionProfile } from '../profile/extension-profile.js';
import { createOverlaySettings } from '../profile/overlay-settings.js';
import { createLanguagePair, type LanguagePair } from '../session/language-pair.js';
import { resolveEffectiveLanguagePair } from './language-routing-policy.js';

const PROFILE_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7C1';

const overlay = createOverlaySettings({
  positionPreset: 'bottom',
  opacity: 0.8,
  maxLines: 2,
  fontScale: 1,
  showOriginalText: true,
  showTranslatedText: true,
})._unsafeUnwrap();

const defaultPair = (source: string, target: string): LanguagePair =>
  createLanguagePair({ source, target })._unsafeUnwrap();

const makeProfile = (params: {
  defaultPair: LanguagePair;
  autoDetectEnabled: boolean;
}): ExtensionProfile =>
  createExtensionProfile({
    profileIdentifier: PROFILE_ID,
    defaultLanguagePair: params.defaultPair,
    defaultOverlaySettings: overlay,
    autoDetectEnabled: params.autoDetectEnabled,
  })._unsafeUnwrap();

describe('LanguageRoutingPolicy (DD-243)', () => {
  describe('override is the highest priority', () => {
    it('returns override even when autoDetect is enabled and detectedSource is provided', () => {
      const profile = makeProfile({
        defaultPair: defaultPair('en-US', 'ja-JP'),
        autoDetectEnabled: true,
      });
      const override = defaultPair('fr-FR', 'de-DE');
      const result = resolveEffectiveLanguagePair({
        profile,
        override,
        detectedSource: 'es-ES',
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value).toEqual(override);
    });

    it('returns override when autoDetect is enabled but detectedSource is absent', () => {
      const profile = makeProfile({
        defaultPair: defaultPair('en-US', 'ja-JP'),
        autoDetectEnabled: true,
      });
      const override = defaultPair('fr-FR', 'de-DE');
      const result = resolveEffectiveLanguagePair({ profile, override });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value).toEqual(override);
    });

    it('returns override when autoDetect is disabled', () => {
      const profile = makeProfile({
        defaultPair: defaultPair('en-US', 'ja-JP'),
        autoDetectEnabled: false,
      });
      const override = defaultPair('fr-FR', 'de-DE');
      const result = resolveEffectiveLanguagePair({ profile, override });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value).toEqual(override);
    });
  });

  describe('auto-detect mode', () => {
    it('swaps source to detectedSource while keeping profile default target', () => {
      const profile = makeProfile({
        defaultPair: defaultPair('en-US', 'ja-JP'),
        autoDetectEnabled: true,
      });
      const result = resolveEffectiveLanguagePair({
        profile,
        detectedSource: 'fr-FR',
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.source).toBe('fr-FR');
        expect(result.value.target).toBe('ja-JP');
      }
    });

    it('returns validation error when detectedSource is not a BCP-47 tag', () => {
      const profile = makeProfile({
        defaultPair: defaultPair('en-US', 'ja-JP'),
        autoDetectEnabled: true,
      });
      const result = resolveEffectiveLanguagePair({
        profile,
        detectedSource: 'NOT_A_TAG',
      });
      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.kind).toBe('validation');
    });

    it('returns validation error when detectedSource equals the profile target (same language pair forbidden)', () => {
      const profile = makeProfile({
        defaultPair: defaultPair('en-US', 'ja-JP'),
        autoDetectEnabled: true,
      });
      const result = resolveEffectiveLanguagePair({
        profile,
        detectedSource: 'ja-JP',
      });
      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.kind).toBe('validation');
    });

    it('accepts a detected variant that differs from target (en-GB vs en-US is distinct)', () => {
      const profile = makeProfile({
        defaultPair: defaultPair('fr-FR', 'en-US'),
        autoDetectEnabled: true,
      });
      const result = resolveEffectiveLanguagePair({
        profile,
        detectedSource: 'en-GB',
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.source).toBe('en-GB');
        expect(result.value.target).toBe('en-US');
      }
    });
  });

  describe('fallback to profile default', () => {
    it('returns profile default when autoDetect is enabled but detectedSource is absent', () => {
      const profile = makeProfile({
        defaultPair: defaultPair('en-US', 'ja-JP'),
        autoDetectEnabled: true,
      });
      const result = resolveEffectiveLanguagePair({ profile });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value).toEqual(profile.defaultLanguagePair);
    });

    it('returns profile default when autoDetect is disabled (detectedSource ignored)', () => {
      const profile = makeProfile({
        defaultPair: defaultPair('en-US', 'ja-JP'),
        autoDetectEnabled: false,
      });
      const result = resolveEffectiveLanguagePair({
        profile,
        detectedSource: 'fr-FR',
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value).toEqual(profile.defaultLanguagePair);
    });
  });
});
