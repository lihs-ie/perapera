import { errAsync, okAsync } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type SourceSessionRepository } from '../../domain/repositories/source-session-repository';
import { createLanguagePair } from '../../domain/session/language-pair';
import { createSourceSession, type SourceSession } from '../../domain/session/source-session';
import {
  invariantViolationError,
  notFoundError,
  type DomainError,
} from '../../domain/shared/errors';
import { type OverlayPresenter } from '../ports/overlay-presenter';
import {
  createUpdateSourceSettingsUseCase,
  type UpdateSourceSettingsDependencies,
} from './update-source-settings-use-case';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const SOURCE_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7B1';
const APPLIED_AT = '2026-04-21T00:05:00.000Z';

const buildSession = (): SourceSession =>
  createSourceSession({
    sessionIdentifier: SESSION_ID,
    sourceIdentifier: SOURCE_ID,
    sourceType: 'tab',
    languagePair: createLanguagePair({ source: 'en-US', target: 'ja-JP' })._unsafeUnwrap(),
    startedAt: '2026-04-21T00:00:00.000Z',
  })._unsafeUnwrap();

const buildDependencies = (
  overrides: Partial<UpdateSourceSettingsDependencies> = {},
): UpdateSourceSettingsDependencies => {
  const sourceSessionRepository: SourceSessionRepository = {
    findById: vi.fn(() => okAsync(buildSession())),
    findActiveSessions: vi.fn(() => okAsync([])),
    findAllSessions: vi.fn(() => okAsync([])),
    save: vi.fn(() => okAsync(undefined)),
  };
  const overlayPresenter: OverlayPresenter = {
    mount: vi.fn(() => okAsync(undefined)),
    render: vi.fn(() => okAsync(undefined)),
    updateSettings: vi.fn(() => okAsync(undefined)),
    unmount: vi.fn(() => okAsync(undefined)),
  };
  return {
    sourceSessionRepository,
    overlayPresenter,
    clock: () => APPLIED_AT,
    ...overrides,
  };
};

describe('createUpdateSourceSettingsUseCase (IMPL-212, DD-303)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {
      /* silence */
    });
  });

  it('updates target language only and saves the session', async () => {
    const deps = buildDependencies();
    const useCase = createUpdateSourceSettingsUseCase(deps);
    const result = await useCase({
      sessionId: SESSION_ID,
      targetLanguage: 'fr-FR',
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.sessionId).toBe(SESSION_ID);
      expect(result.value.appliedAt).toBe(APPLIED_AT);
    }
    expect(deps.sourceSessionRepository.save).toHaveBeenCalledTimes(1);
  });

  it('updates source language only (target unchanged)', async () => {
    const deps = buildDependencies();
    const useCase = createUpdateSourceSettingsUseCase(deps);
    const result = await useCase({
      sessionId: SESSION_ID,
      sourceLanguage: 'fr-FR',
    });
    expect(result.isOk()).toBe(true);
  });

  it('skips save when no language fields and no overlay settings are provided', async () => {
    const deps = buildDependencies();
    const useCase = createUpdateSourceSettingsUseCase(deps);
    const result = await useCase({ sessionId: SESSION_ID });
    expect(result.isOk()).toBe(true);
    expect(deps.sourceSessionRepository.save).not.toHaveBeenCalled();
  });

  it('applies overlay settings via OverlayPresenter.updateSettings', async () => {
    const deps = buildDependencies();
    const useCase = createUpdateSourceSettingsUseCase(deps);
    const result = await useCase({
      sessionId: SESSION_ID,
      overlaySettings: {
        positionPreset: 'bottom',
        opacity: 0.6,
        maxLines: 3,
        fontScale: 1,
        showOriginalText: true,
        showTranslatedText: true,
      },
    });
    expect(result.isOk()).toBe(true);
    expect(deps.overlayPresenter.updateSettings).toHaveBeenCalledTimes(1);
  });

  it('returns validation error when source === target after update', async () => {
    const deps = buildDependencies();
    const useCase = createUpdateSourceSettingsUseCase(deps);
    const result = await useCase({
      sessionId: SESSION_ID,
      sourceLanguage: 'ja-JP',
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.type).toBe('validation');
  });

  it('returns session-not-found when repository reports missing session', async () => {
    const deps = buildDependencies({
      sourceSessionRepository: {
        findById: vi.fn(() =>
          errAsync<SourceSession, DomainError>(
            notFoundError({ resourceType: 'SourceSession', identifier: SESSION_ID }),
          ),
        ),
        findActiveSessions: vi.fn(() => okAsync([])),
        findAllSessions: vi.fn(() => okAsync([])),
        save: vi.fn(() => okAsync(undefined)),
      },
    });
    const useCase = createUpdateSourceSettingsUseCase(deps);
    const result = await useCase({ sessionId: SESSION_ID, targetLanguage: 'fr-FR' });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.type).toBe('session-not-found');
  });

  it('still succeeds when overlayPresenter.updateSettings fails (fire-and-forget)', async () => {
    const deps = buildDependencies({
      overlayPresenter: {
        mount: vi.fn(() => okAsync(undefined)),
        render: vi.fn(() => okAsync(undefined)),
        updateSettings: vi.fn(() =>
          errAsync<void, DomainError>(
            invariantViolationError({ invariant: 'overlay-update-failed', details: 'no host' }),
          ),
        ),
        unmount: vi.fn(() => okAsync(undefined)),
      },
    });
    const useCase = createUpdateSourceSettingsUseCase(deps);
    const result = await useCase({
      sessionId: SESSION_ID,
      overlaySettings: {
        positionPreset: 'top',
        opacity: 0.5,
        maxLines: 2,
        fontScale: 1,
        showOriginalText: true,
        showTranslatedText: true,
      },
    });
    expect(result.isOk()).toBe(true);
  });
});
