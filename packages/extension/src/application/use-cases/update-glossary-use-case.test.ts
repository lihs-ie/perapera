import { errAsync, okAsync } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGlossary, EMPTY_GLOSSARY, type Glossary } from '../../domain/glossary';
import {
  invariantViolationError,
  notFoundError,
  type DomainError,
} from '../../domain/shared/errors';
import { type SettingsStore } from '../ports/settings-store';
import { createUpdateGlossaryUseCase } from './update-glossary-use-case';

const FIXED_CLOCK = '2026-04-24T15:00:00.000Z';

type Deps = Parameters<typeof createUpdateGlossaryUseCase>[0];

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
  saveDefaultGlossary: vi.fn(() => okAsync<void, DomainError>(undefined)),
  getSessionRetentionPolicy: vi.fn(),
  saveSessionRetentionPolicy: vi.fn(),
  getRelayConnectionOverride: vi.fn(),
  saveRelayConnectionOverride: vi.fn(),
  clearRelayConnectionOverride: vi.fn(),
  ...overrides,
});

const buildDeps = (overrides: Partial<Deps> = {}): Deps => ({
  settingsStore: buildSettingsStore(),
  clock: () => FIXED_CLOCK,
  ...overrides,
});

describe('createUpdateGlossaryUseCase (IMPL-212 related, DD-238)', () => {
  let deps: Deps;

  beforeEach(() => {
    deps = buildDeps();
  });

  it('saves a valid glossary and returns savedAt + entryCount', async () => {
    const useCase = createUpdateGlossaryUseCase(deps);
    const input = {
      entries: [
        { source: 'API', target: 'インターフェース', caseSensitive: true },
        { source: 'SDK', target: '開発キット', caseSensitive: false },
      ],
    };
    const result = await useCase(input);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.entryCount).toBe(2);
      expect(result.value.savedAt).toBe(FIXED_CLOCK);
    }
    expect(deps.settingsStore.saveDefaultGlossary).toHaveBeenCalledTimes(1);
  });

  it('saves an empty glossary', async () => {
    const useCase = createUpdateGlossaryUseCase(deps);
    const result = await useCase({ entries: [] });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value.entryCount).toBe(0);
  });

  it('returns validation error when entries malformed (duplicate source)', async () => {
    const useCase = createUpdateGlossaryUseCase(deps);
    const result = await useCase({
      entries: [
        { source: 'API', target: 'X', caseSensitive: true },
        { source: 'API', target: 'Y', caseSensitive: false },
      ],
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.type).toBe('validation');
    expect(deps.settingsStore.saveDefaultGlossary).not.toHaveBeenCalled();
  });

  it('returns validation error when entries exceed 200', async () => {
    const useCase = createUpdateGlossaryUseCase(deps);
    const entries = Array.from({ length: 201 }, (_, i) => ({
      source: `t${i}`,
      target: `訳${i}`,
      caseSensitive: false,
    }));
    const result = await useCase({ entries });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.type).toBe('validation');
  });

  it('returns validation error when input shape invalid', async () => {
    const useCase = createUpdateGlossaryUseCase(deps);
    // @ts-expect-error - intentionally invalid input to exercise validation path
    const result = await useCase({ wrong: true });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.type).toBe('validation');
  });

  it('propagates store write failure as conflict (invariant violation)', async () => {
    const failingStore = buildSettingsStore({
      saveDefaultGlossary: vi.fn(() =>
        errAsync<void, DomainError>(
          invariantViolationError({
            invariant: 'chrome-storage-access',
            details: 'quota exceeded',
          }),
        ),
      ),
    });
    const useCase = createUpdateGlossaryUseCase(buildDeps({ settingsStore: failingStore }));
    const result = await useCase({ entries: [] });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.type).toBe('conflict');
  });

  it('passes branded Glossary (not raw primitive) to SettingsStore.saveDefaultGlossary', async () => {
    const captured: Glossary[] = [];
    const capturingStore = buildSettingsStore({
      saveDefaultGlossary: vi.fn((glossary: Glossary) => {
        captured.push(glossary);
        return okAsync<void, DomainError>(undefined);
      }),
    });
    const useCase = createUpdateGlossaryUseCase(buildDeps({ settingsStore: capturingStore }));
    await useCase({
      entries: [{ source: 'API', target: 'インターフェース', caseSensitive: true }],
    });
    expect(captured).toHaveLength(1);
    const expected = createGlossary({
      entries: [{ source: 'API', target: 'インターフェース', caseSensitive: true }],
    })._unsafeUnwrap();
    expect(captured[0]).toEqual(expected);
  });

  it('does not hit saveDefaultGlossary when validation fails', async () => {
    const useCase = createUpdateGlossaryUseCase(deps);
    await useCase({ entries: [{ source: '', target: 'X', caseSensitive: true }] });
    expect(deps.settingsStore.saveDefaultGlossary).not.toHaveBeenCalled();
  });

  it('ignores getDefaultGlossary (pure write)', async () => {
    const useCase = createUpdateGlossaryUseCase(deps);
    await useCase({ entries: [] });
    expect(deps.settingsStore.getDefaultGlossary).not.toHaveBeenCalled();
  });

  it('wraps not-found from store as session-not-found', async () => {
    const failingStore = buildSettingsStore({
      saveDefaultGlossary: vi.fn(() =>
        errAsync<void, DomainError>(notFoundError({ resourceType: 'X', identifier: 'y' })),
      ),
    });
    const useCase = createUpdateGlossaryUseCase(buildDeps({ settingsStore: failingStore }));
    const result = await useCase({ entries: [] });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.type).toBe('session-not-found');
  });
});
