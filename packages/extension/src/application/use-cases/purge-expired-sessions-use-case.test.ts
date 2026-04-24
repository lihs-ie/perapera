import { errAsync, okAsync } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSessionRetentionPolicy,
  DEFAULT_SESSION_RETENTION_POLICY,
  type SessionRetentionPolicy,
} from '../../domain/retention';
import {
  invariantViolationError,
  notFoundError,
  type DomainError,
} from '../../domain/shared/errors';
import { type PurgeResult, type SessionStore } from '../ports/session-store';
import { type SettingsStore } from '../ports/settings-store';
import { createPurgeExpiredSessionsUseCase } from './purge-expired-sessions-use-case';

const CURRENT_ISO = '2026-04-24T18:00:00.000Z';

type Deps = Parameters<typeof createPurgeExpiredSessionsUseCase>[0];

const buildSessionStore = (overrides: Partial<SessionStore> = {}): SessionStore => ({
  saveSession: vi.fn(),
  appendTranscript: vi.fn(),
  appendTranslation: vi.fn(),
  loadExportBundle: vi.fn(),
  purgeOlderThan: vi.fn(() => okAsync<PurgeResult, DomainError>({ purgedSessionIds: [] })),
  purgeBeyondCount: vi.fn(() => okAsync<PurgeResult, DomainError>({ purgedSessionIds: [] })),
  purgeAll: vi.fn(() => okAsync<PurgeResult, DomainError>({ purgedSessionIds: [] })),
  ...overrides,
});

const buildSettingsStore = (
  policy: SessionRetentionPolicy = DEFAULT_SESSION_RETENTION_POLICY,
  overrides: Partial<SettingsStore> = {},
): SettingsStore => ({
  getDefaultLanguagePair: vi.fn(),
  saveDefaultLanguagePair: vi.fn(),
  getDefaultOverlaySettings: vi.fn(),
  saveDefaultOverlaySettings: vi.fn(),
  getDefaultEndpointingPolicy: vi.fn(),
  saveDefaultEndpointingPolicy: vi.fn(),
  getDefaultTranslationContextWindow: vi.fn(),
  saveDefaultTranslationContextWindow: vi.fn(),
  getDefaultGlossary: vi.fn(),
  saveDefaultGlossary: vi.fn(),
  getSessionRetentionPolicy: vi.fn(() => okAsync<SessionRetentionPolicy, DomainError>(policy)),
  saveSessionRetentionPolicy: vi.fn(),
  getRelayConnectionOverride: vi.fn(),
  saveRelayConnectionOverride: vi.fn(),
  clearRelayConnectionOverride: vi.fn(),
  ...overrides,
});

const buildDeps = (overrides: Partial<Deps> = {}): Deps => ({
  sessionStore: buildSessionStore(),
  settingsStore: buildSettingsStore(),
  clock: () => CURRENT_ISO,
  ...overrides,
});

describe('createPurgeExpiredSessionsUseCase (IMPL-217, DD-239)', () => {
  beforeEach(() => {
    buildDeps();
  });

  it('calls purgeOlderThan with now - days when policy has days', async () => {
    const policy = createSessionRetentionPolicy({ days: 30, maxCount: null })._unsafeUnwrap();
    const sessionStore = buildSessionStore();
    const useCase = createPurgeExpiredSessionsUseCase(
      buildDeps({ sessionStore, settingsStore: buildSettingsStore(policy) }),
    );
    const result = await useCase();
    expect(result.isOk()).toBe(true);
    // 30 days before 2026-04-24 = 2026-03-25
    expect(sessionStore.purgeOlderThan).toHaveBeenCalledWith('2026-03-25T18:00:00.000Z');
    expect(sessionStore.purgeBeyondCount).not.toHaveBeenCalled();
  });

  it('calls purgeBeyondCount with maxCount when policy has maxCount', async () => {
    const policy = createSessionRetentionPolicy({ days: null, maxCount: 100 })._unsafeUnwrap();
    const sessionStore = buildSessionStore();
    const useCase = createPurgeExpiredSessionsUseCase(
      buildDeps({ sessionStore, settingsStore: buildSettingsStore(policy) }),
    );
    const result = await useCase();
    expect(result.isOk()).toBe(true);
    expect(sessionStore.purgeOlderThan).not.toHaveBeenCalled();
    expect(sessionStore.purgeBeyondCount).toHaveBeenCalledWith(100);
  });

  it('calls both purgeOlderThan and purgeBeyondCount when both set', async () => {
    const policy = createSessionRetentionPolicy({ days: 30, maxCount: 100 })._unsafeUnwrap();
    const sessionStore = buildSessionStore();
    const useCase = createPurgeExpiredSessionsUseCase(
      buildDeps({ sessionStore, settingsStore: buildSettingsStore(policy) }),
    );
    await useCase();
    expect(sessionStore.purgeOlderThan).toHaveBeenCalled();
    expect(sessionStore.purgeBeyondCount).toHaveBeenCalled();
  });

  it('accumulates purgedSessionIds from both purge calls (deduplicated)', async () => {
    const policy = createSessionRetentionPolicy({ days: 30, maxCount: 100 })._unsafeUnwrap();
    const sessionStore = buildSessionStore({
      purgeOlderThan: vi.fn(() =>
        okAsync<PurgeResult, DomainError>({ purgedSessionIds: ['a', 'b'] }),
      ),
      purgeBeyondCount: vi.fn(() =>
        okAsync<PurgeResult, DomainError>({ purgedSessionIds: ['b', 'c'] }),
      ),
    });
    const useCase = createPurgeExpiredSessionsUseCase(
      buildDeps({ sessionStore, settingsStore: buildSettingsStore(policy) }),
    );
    const result = await useCase();
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect([...result.value.purgedSessionIds].sort()).toEqual(['a', 'b', 'c']);
      expect(result.value.totalPurged).toBe(3);
    }
  });

  it('defaults to DEFAULT_SESSION_RETENTION_POLICY when SettingsStore has none', async () => {
    const sessionStore = buildSessionStore();
    const settingsStore = buildSettingsStore(DEFAULT_SESSION_RETENTION_POLICY, {
      getSessionRetentionPolicy: vi.fn(() =>
        errAsync<SessionRetentionPolicy, DomainError>(
          notFoundError({ resourceType: 'SessionRetentionPolicy', identifier: 'default' }),
        ),
      ),
    });
    const useCase = createPurgeExpiredSessionsUseCase(buildDeps({ sessionStore, settingsStore }));
    const result = await useCase();
    expect(result.isOk()).toBe(true);
    // default is days=30 / maxCount=100 → both purge methods called
    expect(sessionStore.purgeOlderThan).toHaveBeenCalled();
    expect(sessionStore.purgeBeyondCount).toHaveBeenCalled();
  });

  it('propagates invariant-violation from purgeOlderThan as conflict', async () => {
    const sessionStore = buildSessionStore({
      purgeOlderThan: vi.fn(() =>
        errAsync<PurgeResult, DomainError>(
          invariantViolationError({ invariant: 'session-persistence', details: 'IO' }),
        ),
      ),
    });
    const useCase = createPurgeExpiredSessionsUseCase(buildDeps({ sessionStore }));
    const result = await useCase();
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.type).toBe('conflict');
  });
});
