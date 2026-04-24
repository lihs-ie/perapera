import { errAsync, okAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import { type SourceSessionRepository } from '../../domain/repositories/source-session-repository';
import { type TranscriptStreamRepository } from '../../domain/repositories/transcript-stream-repository';
import { createOverlaySettings } from '../../domain/profile/overlay-settings';
import { DEFAULT_ENDPOINTING_POLICY } from '../../domain/session/endpointing-policy';
import { createLanguagePair } from '../../domain/session/language-pair';
import { DEFAULT_TRANSLATION_CONTEXT_WINDOW } from '../../domain/session/translation-context-window';
import { createSourceSession, type SourceSession } from '../../domain/session/source-session';
import { notFoundError, type DomainError } from '../../domain/shared/errors';
import { createTimestampRange } from '../../domain/transcript/timestamp-range';
import {
  appendPartialTranscriptSegment,
  attachTranslationToSegment,
  createTranscriptStream,
  finalizeSegment,
  type TranscriptStream,
} from '../../domain/transcript/transcript-stream';
import { type SettingsStore } from '../ports/settings-store';
import {
  createGetSessionMonitorStateQuery,
  type GetSessionMonitorStateDependencies,
} from './get-session-monitor-state-query';

const SESSION_ID_1 = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const SESSION_ID_2 = '01HZX8Y1R8M7D3Q2P4T5V6W7A2';
const SOURCE_ID_1 = '01HZX8Y1R8M7D3Q2P4T5V6W7B1';
const SOURCE_ID_2 = '01HZX8Y1R8M7D3Q2P4T5V6W7B2';
const SEGMENT_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7D1';
const TRANSLATION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7E1';

const buildSession = (sessionId: string, sourceId: string): SourceSession =>
  createSourceSession({
    sessionIdentifier: sessionId,
    sourceIdentifier: sourceId,
    sourceType: 'tab',
    languagePair: createLanguagePair({ source: 'en-US', target: 'ja-JP' })._unsafeUnwrap(),
    startedAt: '2026-04-21T00:00:00.000Z',
  })._unsafeUnwrap();

const buildStreamWithTranslation = (sessionId: string): TranscriptStream => {
  let stream = createTranscriptStream({ sessionIdentifier: sessionId })._unsafeUnwrap();
  stream = appendPartialTranscriptSegment(stream, {
    segmentIdentifier: SEGMENT_ID,
    revision: 1,
    text: 'hello',
    timeRange: createTimestampRange({ startMs: 0, endMs: 1000 })._unsafeUnwrap(),
  })._unsafeUnwrap();
  stream = finalizeSegment(stream, { segmentIdentifier: SEGMENT_ID })._unsafeUnwrap();
  stream = attachTranslationToSegment(stream, {
    translationIdentifier: TRANSLATION_ID,
    segmentIdentifier: SEGMENT_ID,
    targetLanguage: 'ja-JP',
    text: 'こんにちは',
  })._unsafeUnwrap();
  return stream;
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
  overrides: Partial<GetSessionMonitorStateDependencies> = {},
): GetSessionMonitorStateDependencies => {
  const sourceSessionRepository: SourceSessionRepository = {
    findById: vi.fn(() => okAsync(buildSession(SESSION_ID_1, SOURCE_ID_1))),
    findActiveSessions: vi.fn(() =>
      okAsync([buildSession(SESSION_ID_1, SOURCE_ID_1), buildSession(SESSION_ID_2, SOURCE_ID_2)]),
    ),
    save: vi.fn(() => okAsync(undefined)),
  };
  const defaultFindBySessionId: TranscriptStreamRepository['findBySessionId'] = (id) =>
    okAsync(buildStreamWithTranslation(id));
  const transcriptStreamRepository: TranscriptStreamRepository = {
    findBySessionId: vi.fn(defaultFindBySessionId),
    appendPartial: vi.fn(() => okAsync(undefined)),
    appendFinal: vi.fn(() => okAsync(undefined)),
    appendTranslation: vi.fn(() => okAsync(undefined)),
  };
  const settingsStore: SettingsStore = {
    getDefaultLanguagePair: vi.fn(() =>
      okAsync(createLanguagePair({ source: 'en-US', target: 'ja-JP' })._unsafeUnwrap()),
    ),
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
    sourceSessionRepository,
    transcriptStreamRepository,
    settingsStore,
    ...overrides,
  };
};

describe('createGetSessionMonitorStateQuery (IMPL-211, DD-302)', () => {
  it('returns active sessions with latest segments', async () => {
    const deps = buildDependencies();
    const query = createGetSessionMonitorStateQuery(deps);
    const result = await query({ includeOverlayState: false });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.sessions).toHaveLength(2);
      expect(result.value.latestSegments.length).toBeGreaterThan(0);
      expect(result.value.overlayState).toBeUndefined();
    }
  });

  it('filters sessions by provided sessionIds', async () => {
    const deps = buildDependencies();
    const query = createGetSessionMonitorStateQuery(deps);
    const result = await query({
      sessionIds: [SESSION_ID_2],
      includeOverlayState: false,
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.sessions).toHaveLength(1);
      expect(result.value.sessions[0]?.sessionId).toBe(SESSION_ID_2);
    }
  });

  it('includes overlayState when includeOverlayState=true and there is at least one session', async () => {
    const deps = buildDependencies();
    const query = createGetSessionMonitorStateQuery(deps);
    const result = await query({ includeOverlayState: true });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.overlayState).toBeDefined();
      expect(result.value.overlayState?.positionPreset).toBe('bottom');
    }
  });

  it('returns empty result when no active sessions exist', async () => {
    const deps = buildDependencies({
      sourceSessionRepository: {
        findById: vi.fn(() => okAsync(buildSession(SESSION_ID_1, SOURCE_ID_1))),
        findActiveSessions: vi.fn(() => okAsync([])),
        save: vi.fn(() => okAsync(undefined)),
      },
    });
    const query = createGetSessionMonitorStateQuery(deps);
    const result = await query({ includeOverlayState: true });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.sessions).toEqual([]);
      expect(result.value.latestSegments).toEqual([]);
    }
  });

  it('tolerates not-found streams (skips latestSegments for that session)', async () => {
    const findBySessionId: TranscriptStreamRepository['findBySessionId'] = (id) => {
      if (id === SESSION_ID_1) {
        return errAsync<TranscriptStream, DomainError>(
          notFoundError({ resourceType: 'TranscriptStream', identifier: id }),
        );
      }
      return okAsync(buildStreamWithTranslation(id));
    };
    const deps = buildDependencies({
      transcriptStreamRepository: {
        findBySessionId: vi.fn(findBySessionId),
        appendPartial: vi.fn(() => okAsync(undefined)),
        appendFinal: vi.fn(() => okAsync(undefined)),
        appendTranslation: vi.fn(() => okAsync(undefined)),
      },
    });
    const query = createGetSessionMonitorStateQuery(deps);
    const result = await query({ includeOverlayState: false });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const sessionsWithSegments = new Set(result.value.latestSegments.map((s) => s.sessionId));
      expect(sessionsWithSegments.has(SESSION_ID_1)).toBe(false);
      expect(sessionsWithSegments.has(SESSION_ID_2)).toBe(true);
    }
  });

  it('skips overlayState silently when settingsStore has no default', async () => {
    const deps = buildDependencies({
      settingsStore: {
        getDefaultLanguagePair: vi.fn(() =>
          okAsync(createLanguagePair({ source: 'en-US', target: 'ja-JP' })._unsafeUnwrap()),
        ),
        saveDefaultLanguagePair: vi.fn(() => okAsync(undefined)),
        getDefaultOverlaySettings: vi.fn(() =>
          errAsync<typeof overlaySettings, DomainError>(
            notFoundError({ resourceType: 'OverlaySettings', identifier: 'default' }),
          ),
        ),
        saveDefaultOverlaySettings: vi.fn(() => okAsync(undefined)),
        getDefaultEndpointingPolicy: vi.fn(() => okAsync(DEFAULT_ENDPOINTING_POLICY)),
        saveDefaultEndpointingPolicy: vi.fn(() => okAsync(undefined)),
        getDefaultTranslationContextWindow: vi.fn(() =>
          okAsync(DEFAULT_TRANSLATION_CONTEXT_WINDOW),
        ),
        saveDefaultTranslationContextWindow: vi.fn(() => okAsync(undefined)),
        getRelayConnectionOverride: vi.fn(() => okAsync(null)),
        saveRelayConnectionOverride: vi.fn(() => okAsync(undefined)),
        clearRelayConnectionOverride: vi.fn(() => okAsync(undefined)),
      },
    });
    const query = createGetSessionMonitorStateQuery(deps);
    const result = await query({ includeOverlayState: true });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.overlayState).toBeUndefined();
    }
  });
});
