import { errAsync, okAsync } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGlossary, EMPTY_GLOSSARY, type Glossary } from '../../domain/glossary';
import {
  invariantViolationError,
  notFoundError,
  type DomainError,
} from '../../domain/shared/errors';
import { type SettingsStore } from '../ports/settings-store';
import { createGetGlossaryQuery } from './get-glossary-query';

type Deps = Parameters<typeof createGetGlossaryQuery>[0];

const buildSettingsStore = (overrides: Partial<SettingsStore> = {}): SettingsStore => ({
  getDefaultLanguagePair: vi.fn(),
  saveDefaultLanguagePair: vi.fn(),
  getDefaultOverlaySettings: vi.fn(),
  saveDefaultOverlaySettings: vi.fn(),
  getDefaultEndpointingPolicy: vi.fn(),
  saveDefaultEndpointingPolicy: vi.fn(),
  getDefaultTranslationContextWindow: vi.fn(),
  saveDefaultTranslationContextWindow: vi.fn(),
  getDefaultGlossary: vi.fn(() => okAsync<Glossary, DomainError>(EMPTY_GLOSSARY)),
  saveDefaultGlossary: vi.fn(),
  getSessionRetentionPolicy: vi.fn(),
  saveSessionRetentionPolicy: vi.fn(),
  getRelayConnectionOverride: vi.fn(),
  saveRelayConnectionOverride: vi.fn(),
  clearRelayConnectionOverride: vi.fn(),
  ...overrides,
});

const buildDeps = (overrides: Partial<Deps> = {}): Deps => ({
  settingsStore: buildSettingsStore(),
  ...overrides,
});

describe('createGetGlossaryQuery (IMPL-215 related, DD-238)', () => {
  let deps: Deps;

  beforeEach(() => {
    deps = buildDeps();
  });

  it('returns stored glossary entries (primitive form)', async () => {
    const glossary = createGlossary({
      entries: [{ source: 'API', target: 'インターフェース', caseSensitive: true }],
    })._unsafeUnwrap();
    const deps2 = buildDeps({
      settingsStore: buildSettingsStore({
        getDefaultGlossary: vi.fn(() => okAsync<Glossary, DomainError>(glossary)),
      }),
    });
    const query = createGetGlossaryQuery(deps2);
    const result = await query();
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.entries).toHaveLength(1);
      expect(result.value.entries[0]).toEqual({
        source: 'API',
        target: 'インターフェース',
        caseSensitive: true,
      });
    }
  });

  it('returns empty entries when store says not-found (default fallback)', async () => {
    const notFoundStore = buildSettingsStore({
      getDefaultGlossary: vi.fn(() =>
        errAsync<Glossary, DomainError>(
          notFoundError({ resourceType: 'Glossary', identifier: 'default' }),
        ),
      ),
    });
    const query = createGetGlossaryQuery(buildDeps({ settingsStore: notFoundStore }));
    const result = await query();
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value.entries).toHaveLength(0);
  });

  it('returns empty entries when store returns empty glossary', async () => {
    const query = createGetGlossaryQuery(deps);
    const result = await query();
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value.entries).toHaveLength(0);
  });

  it('propagates invariant-violation from store as conflict', async () => {
    const failingStore = buildSettingsStore({
      getDefaultGlossary: vi.fn(() =>
        errAsync<Glossary, DomainError>(
          invariantViolationError({
            invariant: 'chrome-storage-access',
            details: 'io error',
          }),
        ),
      ),
    });
    const query = createGetGlossaryQuery(buildDeps({ settingsStore: failingStore }));
    const result = await query();
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.type).toBe('conflict');
  });
});
