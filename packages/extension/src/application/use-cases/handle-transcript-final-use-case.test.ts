import { errAsync, okAsync } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createOverlaySettings } from '../../domain/profile/overlay-settings';
import { type TranscriptStreamRepository } from '../../domain/repositories/transcript-stream-repository';
import { createLanguagePair } from '../../domain/session/language-pair';
import {
  invariantViolationError,
  notFoundError,
  type DomainError,
} from '../../domain/shared/errors';
import { createTimestampRange } from '../../domain/transcript/timestamp-range';
import {
  appendPartialTranscriptSegment,
  createTranscriptStream,
  finalizeSegment,
  type TranscriptStream,
} from '../../domain/transcript/transcript-stream';
import { type OverlayPresenter } from '../ports/overlay-presenter';
import { type SessionStore } from '../ports/session-store';
import { type SettingsStore } from '../ports/settings-store';
import {
  createHandleTranscriptFinalUseCase,
  type HandleTranscriptFinalDependencies,
} from './handle-transcript-final-use-case';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const SEGMENT_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7D1';
const TRANSLATION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7E1';

const buildStreamWithPartial = (): TranscriptStream => {
  const stream = createTranscriptStream({ sessionIdentifier: SESSION_ID })._unsafeUnwrap();
  return appendPartialTranscriptSegment(stream, {
    segmentIdentifier: SEGMENT_ID,
    revision: 1,
    text: 'hello',
    timeRange: createTimestampRange({ startMs: 0, endMs: 1000 })._unsafeUnwrap(),
  })._unsafeUnwrap();
};

const buildStreamWithFinal = (): TranscriptStream => {
  const base = buildStreamWithPartial();
  return finalizeSegment(base, {
    segmentIdentifier: SEGMENT_ID,
    text: 'hello world',
    timeRange: createTimestampRange({ startMs: 0, endMs: 1000 })._unsafeUnwrap(),
  })._unsafeUnwrap();
};

const overlaySettings = createOverlaySettings({
  positionPreset: 'bottom',
  opacity: 0.8,
  maxLines: 2,
  fontScale: 1,
  showOriginalText: true,
  showTranslatedText: true,
})._unsafeUnwrap();

const buildDependencies = (
  overrides: Partial<HandleTranscriptFinalDependencies> = {},
): HandleTranscriptFinalDependencies => {
  const transcriptStreamRepository: TranscriptStreamRepository = {
    findBySessionId: vi.fn(() => okAsync(buildStreamWithPartial())),
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
  };
  return {
    transcriptStreamRepository,
    overlayPresenter,
    sessionStore,
    settingsStore,
    translationIdFactory: () => TRANSLATION_ID,
    ...overrides,
  };
};

describe('createHandleTranscriptFinalUseCase (IMPL-214, DD-305)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {
      /* silence */
    });
  });

  it('finalizes segment without translation (status=pending)', async () => {
    const deps = buildDependencies();
    const useCase = createHandleTranscriptFinalUseCase(deps);
    const result = await useCase({
      sessionId: SESSION_ID,
      segmentId: SEGMENT_ID,
      text: 'hello',
      timeRange: { startMs: 0, endMs: 1000 },
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.translationStatus).toBe('pending');
    }
    expect(deps.transcriptStreamRepository.appendFinal).toHaveBeenCalledTimes(1);
    expect(deps.transcriptStreamRepository.appendTranslation).not.toHaveBeenCalled();
  });

  it('finalizes segment with completed translation', async () => {
    const deps = buildDependencies();
    const useCase = createHandleTranscriptFinalUseCase(deps);
    const result = await useCase({
      sessionId: SESSION_ID,
      segmentId: SEGMENT_ID,
      text: 'hello',
      timeRange: { startMs: 0, endMs: 1000 },
      translation: {
        targetLanguage: 'ja-JP',
        text: 'こんにちは',
        status: 'completed',
      },
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.translationStatus).toBe('completed');
    }
    expect(deps.transcriptStreamRepository.appendTranslation).toHaveBeenCalledTimes(1);
  });

  it('records failed translation status without attaching to stream', async () => {
    const deps = buildDependencies();
    const useCase = createHandleTranscriptFinalUseCase(deps);
    const result = await useCase({
      sessionId: SESSION_ID,
      segmentId: SEGMENT_ID,
      text: 'hello',
      timeRange: { startMs: 0, endMs: 1000 },
      translation: {
        targetLanguage: 'ja-JP',
        text: '',
        status: 'failed',
      },
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.translationStatus).toBe('failed');
    }
    expect(deps.transcriptStreamRepository.appendTranslation).not.toHaveBeenCalled();
  });

  it('accepts empty text with translation (translation-only path)', async () => {
    // text='' は session-command-service.toTranslationFinalInput が
    // translation.final RelayEvent 受信時に合成する marker。Use case は
    // finalizeSegment を skip し、既に別経路で final 化された segment に
    // translation だけを attach する。stream は prior transcript.final で
    // final 化された segment を持つ想定。
    const deps = buildDependencies({
      transcriptStreamRepository: {
        findBySessionId: vi.fn(() => okAsync(buildStreamWithFinal())),
        appendPartial: vi.fn(() => okAsync<void, DomainError>(undefined)),
        appendFinal: vi.fn(() => okAsync<void, DomainError>(undefined)),
        appendTranslation: vi.fn(() => okAsync<void, DomainError>(undefined)),
      },
    });
    const useCase = createHandleTranscriptFinalUseCase(deps);
    const result = await useCase({
      sessionId: SESSION_ID,
      segmentId: SEGMENT_ID,
      text: '',
      timeRange: { startMs: 0, endMs: 1000 },
      translation: {
        targetLanguage: 'ja-JP',
        text: 'こんにちは',
        status: 'completed',
      },
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.translationStatus).toBe('completed');
    }
  });

  it('still succeeds when overlay render fails (hot-path not rolled back)', async () => {
    const deps = buildDependencies({
      overlayPresenter: {
        mount: vi.fn(() => okAsync(undefined)),
        render: vi.fn(() =>
          errAsync<void, DomainError>(
            invariantViolationError({ invariant: 'render-failed', details: 'x' }),
          ),
        ),
        updateSettings: vi.fn(() => okAsync(undefined)),
        unmount: vi.fn(() => okAsync(undefined)),
      },
    });
    const useCase = createHandleTranscriptFinalUseCase(deps);
    const result = await useCase({
      sessionId: SESSION_ID,
      segmentId: SEGMENT_ID,
      text: 'hello',
      timeRange: { startMs: 0, endMs: 1000 },
    });
    expect(result.isOk()).toBe(true);
  });

  it('propagates finalize error as conflict', async () => {
    const streamWithFinalized = (() => {
      let s = createTranscriptStream({ sessionIdentifier: SESSION_ID })._unsafeUnwrap();
      s = appendPartialTranscriptSegment(s, {
        segmentIdentifier: SEGMENT_ID,
        revision: 1,
        text: 'first',
        timeRange: createTimestampRange({ startMs: 0, endMs: 1000 })._unsafeUnwrap(),
      })._unsafeUnwrap();
      // segment already finalized
      const alreadyFinal = s.segments.get(SEGMENT_ID);
      if (alreadyFinal === undefined) throw new Error('unreachable');
      const finals = new Map(s.segments);
      finals.set(SEGMENT_ID, { ...alreadyFinal, isFinal: true });
      return { ...s, segments: finals };
    })();
    const deps = buildDependencies({
      transcriptStreamRepository: {
        findBySessionId: vi.fn(() => okAsync(streamWithFinalized)),
        appendPartial: vi.fn(() => okAsync(undefined)),
        appendFinal: vi.fn(() => okAsync(undefined)),
        appendTranslation: vi.fn(() => okAsync(undefined)),
      },
    });
    const useCase = createHandleTranscriptFinalUseCase(deps);
    const result = await useCase({
      sessionId: SESSION_ID,
      segmentId: SEGMENT_ID,
      text: 'hello',
      timeRange: { startMs: 0, endMs: 1000 },
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.type).toBe('conflict');
  });
});
