import { describe, expect, it } from 'vitest';
import { createExtensionProfile } from '../profile/extension-profile';
import { createOverlaySettings } from '../profile/overlay-settings';
import { createEndpointingPolicy, DEFAULT_ENDPOINTING_POLICY } from '../session/endpointing-policy';
import { createLanguagePair } from '../session/language-pair';
import {
  createTranslationContextWindow,
  DEFAULT_TRANSLATION_CONTEXT_WINDOW,
} from '../session/translation-context-window';
import {
  resolveEffectiveEndpointingPolicy,
  resolveEffectiveTranslationContextWindow,
} from './endpointing-policy-resolver';

const profile = createExtensionProfile({
  profileIdentifier: '01HZX8Y1R8M7D3Q2P4T5V6W7X8',
  defaultLanguagePair: createLanguagePair({ source: 'en-US', target: 'ja-JP' })._unsafeUnwrap(),
  defaultOverlaySettings: createOverlaySettings({
    positionPreset: 'bottom',
    opacity: 0.85,
    maxLines: 2,
    fontScale: 1,
    showOriginalText: true,
    showTranslatedText: true,
  })._unsafeUnwrap(),
  autoDetectEnabled: false,
})._unsafeUnwrap();

describe('EndpointingPolicyResolver (DD-244)', () => {
  describe('resolveEffectiveEndpointingPolicy', () => {
    it('returns profile default when override is absent', () => {
      const result = resolveEffectiveEndpointingPolicy({ profile });
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe(DEFAULT_ENDPOINTING_POLICY);
    });

    it('returns override when provided', () => {
      const override = createEndpointingPolicy({
        silenceThresholdMs: 900,
        punctuationAware: false,
        minUtteranceMs: 700,
      })._unsafeUnwrap();
      const result = resolveEffectiveEndpointingPolicy({ profile, override });
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe(override);
    });
  });

  describe('resolveEffectiveTranslationContextWindow', () => {
    it('returns profile default when override is absent', () => {
      const result = resolveEffectiveTranslationContextWindow({ profile });
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe(DEFAULT_TRANSLATION_CONTEXT_WINDOW);
    });

    it('returns override when provided', () => {
      const override = createTranslationContextWindow({
        maxSegments: 5,
        includeTranslatedText: false,
      })._unsafeUnwrap();
      const result = resolveEffectiveTranslationContextWindow({ profile, override });
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe(override);
    });
  });
});
