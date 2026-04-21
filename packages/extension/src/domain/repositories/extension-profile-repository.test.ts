import { errAsync, okAsync } from 'neverthrow';
import { describe, expect, it } from 'vitest';
import { createExtensionProfile, type ExtensionProfile } from '../profile/extension-profile';
import { createOverlaySettings } from '../profile/overlay-settings';
import { createLanguagePair } from '../session/language-pair';
import { notFoundError, type DomainError } from '../shared/errors';
import { type ExtensionProfileRepository } from './extension-profile-repository';

const PROFILE_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7C1';

const buildProfile = (): ExtensionProfile =>
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

describe('ExtensionProfileRepository (DD-262)', () => {
  describe('type contract', () => {
    it('accepts an object literal that implements all required methods as a valid ExtensionProfileRepository', () => {
      const mock: ExtensionProfileRepository = {
        getDefault: () => okAsync(buildProfile()),
        save: () => okAsync(undefined),
      };
      expect(typeof mock.getDefault).toBe('function');
      expect(typeof mock.save).toBe('function');
    });
  });

  describe('getDefault', () => {
    it('returns the stored ExtensionProfile on the success path', async () => {
      const profile = buildProfile();
      const mock: ExtensionProfileRepository = {
        getDefault: () => okAsync(profile),
        save: () => okAsync(undefined),
      };
      const result = await mock.getDefault();
      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value).toBe(profile);
    });

    it('returns a notFoundError when the default profile is not initialized', async () => {
      const mock: ExtensionProfileRepository = {
        getDefault: () =>
          errAsync<ExtensionProfile, DomainError>(
            notFoundError({ resourceType: 'ExtensionProfile', identifier: 'default' }),
          ),
        save: () => okAsync(undefined),
      };
      const result = await mock.getDefault();
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.kind).toBe('not-found');
        if (result.error.kind === 'not-found') {
          expect(result.error.resourceType).toBe('ExtensionProfile');
          expect(result.error.identifier).toBe('default');
        }
      }
    });
  });

  describe('save', () => {
    it('resolves to ok(void) on the success path (upsert semantics)', async () => {
      const mock: ExtensionProfileRepository = {
        getDefault: () => okAsync(buildProfile()),
        save: () => okAsync(undefined),
      };
      const result = await mock.save(buildProfile());
      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value).toBeUndefined();
    });
  });
});
