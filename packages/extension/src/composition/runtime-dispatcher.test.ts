import { errAsync, okAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import {
  permissionRequiredAppError,
  type ApplicationError,
} from '../application/errors/application-errors';
import { type SessionStore } from '../application/ports/session-store';
import { type SettingsStore } from '../application/ports/settings-store';
import { type ExportService } from '../application/services/export-service';
import { type SessionCommandService } from '../application/services/session-command-service';
import { type GetSessionMonitorStateQuery } from '../application/use-cases/get-session-monitor-state-query';
import { createOverlaySettings } from '../domain/profile/overlay-settings';
import { createLanguagePair } from '../domain/session/language-pair';
import { notFoundError, type DomainError } from '../domain/shared/errors';
import { createRuntimeDispatcher } from './runtime-dispatcher';

const buildFakeDeps = () => {
  const sessionCommandService: SessionCommandService = {
    startSource: vi.fn(() => okAsync({ sessionId: 's', state: 'idle', startedAt: 'now' })),
    stopSource: vi.fn(() => okAsync({ sessionId: 's', state: 'stopped', stoppedAt: 'now' })),
    applySourceSettings: vi.fn(() => okAsync({ sessionId: 's', appliedAt: 'now' })),
    handleRelayEvent: vi.fn(() => okAsync<void, ApplicationError>(undefined)),
  };
  const exportService: ExportService = {
    export: vi.fn(() =>
      okAsync({ exportId: 'exp', format: 'txt' as const, bytes: 100, content: 'x' }),
    ),
  };
  const getSessionMonitorStateQuery: GetSessionMonitorStateQuery = vi.fn(() =>
    okAsync({ sessions: [], latestSegments: [] }),
  );
  const settingsStore: SettingsStore = {
    getDefaultLanguagePair: vi.fn(() =>
      errAsync(notFoundError({ resourceType: 'LanguagePair', identifier: 'default' })),
    ),
    saveDefaultLanguagePair: vi.fn(() => okAsync<void, DomainError>(undefined)),
    getDefaultOverlaySettings: vi.fn(() =>
      errAsync(notFoundError({ resourceType: 'OverlaySettings', identifier: 'default' })),
    ),
    saveDefaultOverlaySettings: vi.fn(() => okAsync<void, DomainError>(undefined)),
    getDefaultEndpointingPolicy: vi.fn(() =>
      errAsync(notFoundError({ resourceType: 'EndpointingPolicy', identifier: 'default' })),
    ),
    saveDefaultEndpointingPolicy: vi.fn(() => okAsync<void, DomainError>(undefined)),
    getDefaultTranslationContextWindow: vi.fn(() =>
      errAsync(notFoundError({ resourceType: 'TranslationContextWindow', identifier: 'default' })),
    ),
    saveDefaultTranslationContextWindow: vi.fn(() => okAsync<void, DomainError>(undefined)),
    getDefaultGlossary: vi.fn(() =>
      errAsync(notFoundError({ resourceType: 'Glossary', identifier: 'default' })),
    ),
    saveDefaultGlossary: vi.fn(() => okAsync<void, DomainError>(undefined)),
    getSessionRetentionPolicy: vi.fn(() =>
      errAsync(notFoundError({ resourceType: 'SessionRetentionPolicy', identifier: 'default' })),
    ),
    saveSessionRetentionPolicy: vi.fn(() => okAsync<void, DomainError>(undefined)),
    getRelayConnectionOverride: vi.fn(() => okAsync(null)),
    saveRelayConnectionOverride: vi.fn(() => okAsync<void, DomainError>(undefined)),
    clearRelayConnectionOverride: vi.fn(() => okAsync<void, DomainError>(undefined)),
  };
  const getSessionHistoryQuery = vi.fn(() => okAsync({ sessions: [] }));
  const getSessionHistoryDetailQuery = vi.fn(() =>
    okAsync({
      summary: {
        sessionId: 's',
        displayName: 's',
        sourceType: 'tab',
        state: 'stopped',
        sourceLanguage: 'en-US',
        targetLanguage: 'ja-JP',
        startedAt: '2026-04-21T00:00:00.000Z',
        stoppedAt: '2026-04-21T00:01:00.000Z',
        durationMs: 60_000,
      },
      lines: [],
    }),
  );
  const getGlossaryQuery = vi.fn(() => okAsync({ entries: [] }));
  const updateGlossaryUseCase = vi.fn(() =>
    okAsync({ entryCount: 0, savedAt: '2026-04-24T00:00:00.000Z' }),
  );
  const purgeExpiredSessionsUseCase = vi.fn(() =>
    okAsync({ purgedSessionIds: [], totalPurged: 0 }),
  );
  const searchSessionHistoryQuery = vi.fn(() => okAsync({ sessions: [] }));
  const sessionStore: SessionStore = {
    saveSession: vi.fn(() => okAsync(undefined)),
    appendTranscript: vi.fn(() => okAsync(undefined)),
    appendTranslation: vi.fn(() => okAsync(undefined)),
    loadExportBundle: vi.fn(),
    purgeOlderThan: vi.fn(() => okAsync({ purgedSessionIds: [] })),
    purgeBeyondCount: vi.fn(() => okAsync({ purgedSessionIds: [] })),
    purgeAll: vi.fn(() => okAsync({ purgedSessionIds: [] })),
  };
  return {
    sessionCommandService,
    exportService,
    getSessionMonitorStateQuery,
    getSessionHistoryQuery,
    getSessionHistoryDetailQuery,
    getGlossaryQuery,
    updateGlossaryUseCase,
    purgeExpiredSessionsUseCase,
    searchSessionHistoryQuery,
    sessionStore,
    settingsStore,
  };
};

// references for language-pair / overlay-settings factories used in later tests
void createLanguagePair;
void createOverlaySettings;

describe('createRuntimeDispatcher (IMPL-502)', () => {
  it('dispatches command.start-source-session to SessionCommandService.startSource', async () => {
    const deps = buildFakeDeps();
    const dispatch = createRuntimeDispatcher(deps);
    const response = await dispatch({
      type: 'command.start-source-session',
      input: {
        sourceType: 'tab',
        displayName: 'x',
        autoDetectLanguage: false,
        targetLanguage: 'ja-JP',
        overlayTarget: { kind: 'tab', tabId: 42 },
      },
    });
    expect(response.ok).toBe(true);
    expect(deps.sessionCommandService.startSource).toHaveBeenCalledOnce();
    expect(deps.sessionCommandService.stopSource).not.toHaveBeenCalled();
  });

  it('dispatches command.stop-source-session to SessionCommandService.stopSource', async () => {
    const deps = buildFakeDeps();
    const dispatch = createRuntimeDispatcher(deps);
    await dispatch({
      type: 'command.stop-source-session',
      input: { sessionId: '01HZX8Y1R8M7D3Q2P4T5V6W7A1' },
    });
    expect(deps.sessionCommandService.stopSource).toHaveBeenCalledOnce();
  });

  it('dispatches command.update-source-settings to applySourceSettings', async () => {
    const deps = buildFakeDeps();
    const dispatch = createRuntimeDispatcher(deps);
    await dispatch({
      type: 'command.update-source-settings',
      input: { sessionId: '01HZX8Y1R8M7D3Q2P4T5V6W7A1' },
    });
    expect(deps.sessionCommandService.applySourceSettings).toHaveBeenCalledOnce();
  });

  it('dispatches command.export-session-result to ExportService.export', async () => {
    const deps = buildFakeDeps();
    const dispatch = createRuntimeDispatcher(deps);
    const response = await dispatch({
      type: 'command.export-session-result',
      input: {
        sessionId: '01HZX8Y1R8M7D3Q2P4T5V6W7A1',
        format: 'txt',
        includeOriginal: true,
        includeTranslation: true,
      },
    });
    expect(response.ok).toBe(true);
    expect(deps.exportService.export).toHaveBeenCalledOnce();
  });

  it('dispatches query.get-session-monitor-state to GetSessionMonitorStateQuery', async () => {
    const deps = buildFakeDeps();
    const dispatch = createRuntimeDispatcher(deps);
    const response = await dispatch({
      type: 'query.get-session-monitor-state',
      input: { includeOverlayState: false },
    });
    expect(response.ok).toBe(true);
    expect(deps.getSessionMonitorStateQuery).toHaveBeenCalledOnce();
  });

  it('returns validation-error when the request payload is malformed', async () => {
    const deps = buildFakeDeps();
    const dispatch = createRuntimeDispatcher(deps);
    const response = await dispatch({ type: 'not-a-valid-command' });
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.type).toBe('validation');
    }
  });

  it('propagates ApplicationError from UseCase failure', async () => {
    const fakeError = permissionRequiredAppError({
      sourceType: 'tab',
      message: 'denied',
    });
    const deps = buildFakeDeps();
    const depsWithFailure = {
      ...deps,
      sessionCommandService: {
        ...deps.sessionCommandService,
        startSource: vi.fn(() => errAsync(fakeError)),
      },
    };
    const dispatch = createRuntimeDispatcher(depsWithFailure);
    const response = await dispatch({
      type: 'command.start-source-session',
      input: {
        sourceType: 'tab',
        displayName: 'x',
        autoDetectLanguage: false,
        targetLanguage: 'ja-JP',
        overlayTarget: { kind: 'tab', tabId: 42 },
      },
    });
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.type).toBe('permission-required');
    }
  });
});
