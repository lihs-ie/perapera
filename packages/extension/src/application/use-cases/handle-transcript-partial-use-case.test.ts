import { errAsync, okAsync } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createOverlaySettings } from '../../domain/profile/overlay-settings';
import { DEFAULT_ENDPOINTING_POLICY } from '../../domain/session/endpointing-policy';
import { DEFAULT_TRANSLATION_CONTEXT_WINDOW } from '../../domain/session/translation-context-window';
import { type TranscriptStreamRepository } from '../../domain/repositories/transcript-stream-repository';
import { createLanguagePair } from '../../domain/session/language-pair';
import {
  invariantViolationError,
  notFoundError,
  type DomainError,
} from '../../domain/shared/errors';
import {
  createTranscriptStream,
  type TranscriptStream,
} from '../../domain/transcript/transcript-stream';
import { type OverlayPresenter } from '../ports/overlay-presenter';
import { type SessionStore } from '../ports/session-store';
import { type SettingsStore } from '../ports/settings-store';
import {
  createHandleTranscriptPartialUseCase,
  type HandleTranscriptPartialDependencies,
} from './handle-transcript-partial-use-case';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const SEGMENT_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7D1';

const buildStream = (): TranscriptStream =>
  createTranscriptStream({ sessionIdentifier: SESSION_ID })._unsafeUnwrap();

const overlaySettings = createOverlaySettings({
  positionPreset: 'bottom',
  opacity: 0.8,
  maxLines: 2,
  fontScale: 1,
  showOriginalText: true,
  showTranslatedText: true,
})._unsafeUnwrap();

const buildDependencies = (
  overrides: Partial<HandleTranscriptPartialDependencies> = {},
): HandleTranscriptPartialDependencies => {
  const transcriptStreamRepository: TranscriptStreamRepository = {
    findBySessionId: vi.fn(() => okAsync(buildStream())),
    appendPartial: vi.fn(() => okAsync(undefined)),
    appendFinal: vi.fn(() => okAsync(undefined)),
    appendTranslation: vi.fn(() => okAsync(undefined)),
  };
  const overlayPresenter: OverlayPresenter = {
    mount: vi.fn(() => okAsync(undefined)),
    render: vi.fn(() => okAsync(undefined)),
    updateSettings: vi.fn(() => okAsync(undefined)),
    unmount: vi.fn(() => okAsync(undefined)),
  };
  const sessionStore: SessionStore = {
    saveSession: vi.fn(() => okAsync(undefined)),
    appendTranscript: vi.fn(() => okAsync(undefined)),
    appendTranslation: vi.fn(() => okAsync(undefined)),
    loadExportBundle: vi.fn(() =>
      errAsync<never, DomainError>(
        notFoundError({ resourceType: 'SourceSession', identifier: 'unused' }),
      ),
    ),
  };
  const defaultLanguagePair = createLanguagePair({
    source: 'en-US',
    target: 'ja-JP',
  })._unsafeUnwrap();
  const getDefaultLanguagePair: SettingsStore['getDefaultLanguagePair'] = () =>
    okAsync(defaultLanguagePair);
  const settingsStore: SettingsStore = {
    getDefaultLanguagePair: vi.fn(getDefaultLanguagePair),
    saveDefaultLanguagePair: vi.fn(() => okAsync(undefined)),
    getDefaultOverlaySettings: vi.fn(() => okAsync(overlaySettings)),
    saveDefaultOverlaySettings: vi.fn(() => okAsync(undefined)),
    getDefaultEndpointingPolicy: vi.fn(() => okAsync(DEFAULT_ENDPOINTING_POLICY)),
    saveDefaultEndpointingPolicy: vi.fn(() => okAsync(undefined)),
    getDefaultTranslationContextWindow: vi.fn(() => okAsync(DEFAULT_TRANSLATION_CONTEXT_WINDOW)),
    saveDefaultTranslationContextWindow: vi.fn(() => okAsync(undefined)),
    getRelayConnectionOverride: vi.fn(() => okAsync(null)),
    saveRelayConnectionOverride: vi.fn(() => okAsync(undefined)),
    clearRelayConnectionOverride: vi.fn(() => okAsync(undefined)),
  };
  return {
    transcriptStreamRepository,
    overlayPresenter,
    sessionStore,
    settingsStore,
    ...overrides,
  };
};

describe('createHandleTranscriptPartialUseCase (IMPL-213, DD-304)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {
      /* silence */
    });
  });

  it('appends partial segment and renders overlay', async () => {
    const deps = buildDependencies();
    const useCase = createHandleTranscriptPartialUseCase(deps);
    const result = await useCase({
      sessionId: SESSION_ID,
      segmentId: SEGMENT_ID,
      revision: 1,
      text: 'hello',
      timeRange: { startMs: 0, endMs: 1000 },
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.sessionId).toBe(SESSION_ID);
      expect(result.value.segmentId).toBe(SEGMENT_ID);
      expect(result.value.revision).toBe(1);
      expect(result.value.renderModel.lines.length).toBeGreaterThan(0);
    }
    expect(deps.transcriptStreamRepository.appendPartial).toHaveBeenCalledTimes(1);
    expect(deps.overlayPresenter.render).toHaveBeenCalledTimes(1);
  });

  it('returns validation error on empty text', async () => {
    const deps = buildDependencies();
    const useCase = createHandleTranscriptPartialUseCase(deps);
    const result = await useCase({
      sessionId: SESSION_ID,
      segmentId: SEGMENT_ID,
      revision: 1,
      text: '',
      timeRange: { startMs: 0, endMs: 1000 },
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.type).toBe('validation');
  });

  it('auto-creates empty stream and succeeds when repository reports missing session (append-only semantic)', async () => {
    // Repository は append-only 設計のため findBySessionId で 0 row 時は not-found
    // を返す。handle-transcript-partial はこれを initial state として空 stream を
    // 合成し、続けて appendPartial で persist することで「最初の partial」を
    // 受け入れる。
    const appendPartialMock = vi.fn(() => okAsync<void, DomainError>(undefined));
    const deps = buildDependencies({
      transcriptStreamRepository: {
        findBySessionId: vi.fn(() =>
          errAsync<TranscriptStream, DomainError>(
            notFoundError({ resourceType: 'TranscriptStream', identifier: SESSION_ID }),
          ),
        ),
        appendPartial: appendPartialMock,
        appendFinal: vi.fn(() => okAsync(undefined)),
        appendTranslation: vi.fn(() => okAsync(undefined)),
      },
    });
    const useCase = createHandleTranscriptPartialUseCase(deps);
    const result = await useCase({
      sessionId: SESSION_ID,
      segmentId: SEGMENT_ID,
      revision: 1,
      text: 'hello',
      timeRange: { startMs: 0, endMs: 1000 },
    });
    expect(result.isOk()).toBe(true);
    expect(appendPartialMock).toHaveBeenCalledTimes(1);
  });

  it('still succeeds when overlayPresenter.render fails (hot-path not rolled back)', async () => {
    const deps = buildDependencies({
      overlayPresenter: {
        mount: vi.fn(() => okAsync(undefined)),
        render: vi.fn(() =>
          errAsync<void, DomainError>(
            invariantViolationError({ invariant: 'render-failed', details: 'dom' }),
          ),
        ),
        updateSettings: vi.fn(() => okAsync(undefined)),
        unmount: vi.fn(() => okAsync(undefined)),
      },
    });
    const useCase = createHandleTranscriptPartialUseCase(deps);
    const result = await useCase({
      sessionId: SESSION_ID,
      segmentId: SEGMENT_ID,
      revision: 1,
      text: 'hello',
      timeRange: { startMs: 0, endMs: 1000 },
    });
    expect(result.isOk()).toBe(true);
  });

  it('propagates appendPartial error as conflict', async () => {
    const deps = buildDependencies({
      transcriptStreamRepository: {
        findBySessionId: vi.fn(() => okAsync(buildStream())),
        appendPartial: vi.fn(() =>
          errAsync<void, DomainError>(
            invariantViolationError({ invariant: 'storage-write-failed', details: 'quota' }),
          ),
        ),
        appendFinal: vi.fn(() => okAsync(undefined)),
        appendTranslation: vi.fn(() => okAsync(undefined)),
      },
    });
    const useCase = createHandleTranscriptPartialUseCase(deps);
    const result = await useCase({
      sessionId: SESSION_ID,
      segmentId: SEGMENT_ID,
      revision: 1,
      text: 'hello',
      timeRange: { startMs: 0, endMs: 1000 },
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.type).toBe('conflict');
  });
});
