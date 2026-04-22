import { errAsync, okAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import {
  createExtensionProfile,
  type ExtensionProfile,
} from '../../domain/profile/extension-profile';
import { createOverlaySettings } from '../../domain/profile/overlay-settings';
import { parseProfileIdentifier } from '../../domain/profile/profile-identifier';
import { type ExtensionProfileRepository } from '../../domain/repositories/extension-profile-repository';
import { createLanguagePair } from '../../domain/session/language-pair';
import {
  invariantViolationError,
  notFoundError,
  type DomainError,
} from '../../domain/shared/errors';
import { createEnsureDefaultProfile } from './ensure-default-profile';

const SEED_PROFILE_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7B1';

const buildExistingProfile = (): ExtensionProfile =>
  createExtensionProfile({
    profileIdentifier: '01HZX8Y1R8M7D3Q2P4T5V6W7A1',
    defaultLanguagePair: createLanguagePair({ source: 'ja-JP', target: 'en-US' })._unsafeUnwrap(),
    defaultOverlaySettings: createOverlaySettings({
      positionPreset: 'top',
      opacity: 0.5,
      maxLines: 2,
      fontScale: 1.5,
      showOriginalText: false,
      showTranslatedText: true,
    })._unsafeUnwrap(),
    autoDetectEnabled: false,
  })._unsafeUnwrap();

describe('createEnsureDefaultProfile (IMPL-620 default profile seed)', () => {
  it('returns the existing profile without saving when getDefault already resolves', async () => {
    const existing = buildExistingProfile();
    const repository: ExtensionProfileRepository = {
      getDefault: vi.fn(() => okAsync(existing)),
      save: vi.fn(() => okAsync<void, DomainError>(undefined)),
    };
    const service = createEnsureDefaultProfile({
      extensionProfileRepository: repository,
      generateProfileIdentifier: () => parseProfileIdentifier(SEED_PROFILE_ID)._unsafeUnwrap(),
    });

    const result = await service.ensure();

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe(existing);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('seeds and saves a default profile when getDefault reports ExtensionProfile not found', async () => {
    let seeded: ExtensionProfile | null = null;
    const repository: ExtensionProfileRepository = {
      getDefault: vi.fn(() =>
        errAsync<ExtensionProfile, DomainError>(
          notFoundError({ resourceType: 'ExtensionProfile', identifier: 'default' }),
        ),
      ),
      save: vi.fn((profile: ExtensionProfile) => {
        seeded = profile;
        return okAsync<void, DomainError>(undefined);
      }),
    };
    const service = createEnsureDefaultProfile({
      extensionProfileRepository: repository,
      generateProfileIdentifier: () => parseProfileIdentifier(SEED_PROFILE_ID)._unsafeUnwrap(),
    });

    const result = await service.ensure();

    expect(result.isOk()).toBe(true);
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(seeded).not.toBeNull();
    if (seeded === null) {
      throw new Error('save callback did not receive a profile');
    }
    const savedProfile: ExtensionProfile = seeded;
    expect(savedProfile.profileIdentifier).toBe(SEED_PROFILE_ID);
    expect(savedProfile.defaultLanguagePair.source).toBe('en-US');
    expect(savedProfile.defaultLanguagePair.target).toBe('ja-JP');
    expect(savedProfile.defaultOverlaySettings.positionPreset).toBe('bottom');
    expect(savedProfile.defaultOverlaySettings.opacity).toBeCloseTo(0.85);
    expect(savedProfile.defaultOverlaySettings.maxLines).toBe(3);
    expect(savedProfile.defaultOverlaySettings.fontScale).toBeCloseTo(1);
    expect(savedProfile.defaultOverlaySettings.showOriginalText).toBe(true);
    expect(savedProfile.defaultOverlaySettings.showTranslatedText).toBe(true);
    expect(savedProfile.autoDetectEnabled).toBe(true);
    expect(result._unsafeUnwrap()).toBe(savedProfile);
  });

  it('propagates non-not-found errors without seeding', async () => {
    const repository: ExtensionProfileRepository = {
      getDefault: vi.fn(() =>
        errAsync<ExtensionProfile, DomainError>(
          invariantViolationError({
            invariant: 'profile-persistence',
            details: 'chrome.storage.local broken',
          }),
        ),
      ),
      save: vi.fn(() => okAsync<void, DomainError>(undefined)),
    };
    const service = createEnsureDefaultProfile({
      extensionProfileRepository: repository,
    });

    const result = await service.ensure();

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().kind).toBe('invariant-violation');
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('propagates not-found errors for other resource types (does not seed)', async () => {
    const repository: ExtensionProfileRepository = {
      getDefault: vi.fn(() =>
        errAsync<ExtensionProfile, DomainError>(
          notFoundError({ resourceType: 'LanguagePair', identifier: 'default' }),
        ),
      ),
      save: vi.fn(() => okAsync<void, DomainError>(undefined)),
    };
    const service = createEnsureDefaultProfile({
      extensionProfileRepository: repository,
    });

    const result = await service.ensure();

    expect(result.isErr()).toBe(true);
    const error = result._unsafeUnwrapErr();
    expect(error.kind).toBe('not-found');
    if (error.kind === 'not-found') {
      expect(error.resourceType).toBe('LanguagePair');
    }
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('propagates save failures during seeding', async () => {
    const repository: ExtensionProfileRepository = {
      getDefault: vi.fn(() =>
        errAsync<ExtensionProfile, DomainError>(
          notFoundError({ resourceType: 'ExtensionProfile', identifier: 'default' }),
        ),
      ),
      save: vi.fn(() =>
        errAsync<void, DomainError>(
          invariantViolationError({
            invariant: 'profile-persistence',
            details: 'save: quota exceeded',
          }),
        ),
      ),
    };
    const service = createEnsureDefaultProfile({
      extensionProfileRepository: repository,
      generateProfileIdentifier: () => parseProfileIdentifier(SEED_PROFILE_ID)._unsafeUnwrap(),
    });

    const result = await service.ensure();

    expect(result.isErr()).toBe(true);
    const error = result._unsafeUnwrapErr();
    expect(error.kind).toBe('invariant-violation');
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it('uses the default identifier generator when not injected', async () => {
    let seeded: ExtensionProfile | null = null;
    const repository: ExtensionProfileRepository = {
      getDefault: vi.fn(() =>
        errAsync<ExtensionProfile, DomainError>(
          notFoundError({ resourceType: 'ExtensionProfile', identifier: 'default' }),
        ),
      ),
      save: vi.fn((profile: ExtensionProfile) => {
        seeded = profile;
        return okAsync<void, DomainError>(undefined);
      }),
    };
    const service = createEnsureDefaultProfile({ extensionProfileRepository: repository });

    const result = await service.ensure();

    expect(result.isOk()).toBe(true);
    expect(seeded).not.toBeNull();
    if (seeded === null) {
      throw new Error('save callback did not receive a profile');
    }
    const savedProfile: ExtensionProfile = seeded;
    expect(savedProfile.profileIdentifier).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });
});
