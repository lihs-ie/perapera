import { errAsync, okAsync } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type ExtensionProfileRepository } from '../../domain/repositories/extension-profile-repository';
import { type SourceSessionRepository } from '../../domain/repositories/source-session-repository';
import {
  createExtensionProfile,
  type ExtensionProfile,
} from '../../domain/profile/extension-profile';
import { createOverlaySettings } from '../../domain/profile/overlay-settings';
import { createLanguagePair } from '../../domain/session/language-pair';
import { parseSessionIdentifier } from '../../domain/session/session-identifier';
import { createSourceSession, type SourceSession } from '../../domain/session/source-session';
import {
  invariantViolationError,
  notFoundError,
  type DomainError,
} from '../../domain/shared/errors';
import { type AudioFrameEnvelope } from '../ports/audio-preprocessor';
import { type PermissionCoordinator } from '../ports/permission-coordinator';
import { type RelayGateway } from '../ports/relay-gateway';
import { type AudioFramePump } from '../services/audio-frame-pump';
import { type CaptureOrchestrator } from '../services/capture-orchestrator';
import { type RelaySessionSubscriber } from '../services/relay-session-subscriber';
import {
  createStartSourceSessionUseCase,
  type StartSourceSessionDependencies,
} from './start-source-session-use-case';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const SOURCE_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7B1';
const PROFILE_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7C1';
const STARTED_AT = '2026-04-21T00:00:00.000Z';

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

const buildDependencies = (
  overrides: Partial<StartSourceSessionDependencies> = {},
): StartSourceSessionDependencies => {
  const sourceSessionRepository: SourceSessionRepository = {
    findById: vi.fn(() => okAsync(buildSessionIdle())),
    findActiveSessions: vi.fn(() => okAsync([])),
    save: vi.fn(() => okAsync(undefined)),
  };
  const extensionProfileRepository: ExtensionProfileRepository = {
    getDefault: vi.fn(() => okAsync(buildProfile())),
    save: vi.fn(() => okAsync(undefined)),
  };
  const relayGateway: RelayGateway = {
    openSession: vi.fn(() => okAsync(undefined)),
    sendAudioFrame: vi.fn(() => okAsync(undefined)),
    closeSession: vi.fn(() => okAsync(undefined)),
    subscribe: vi.fn(() => () => {
      /* noop */
    }),
  };
  const grantingRequestFor: PermissionCoordinator['requestFor'] = (sourceType) =>
    okAsync({ status: 'granted', sourceType });
  const permissionCoordinator: PermissionCoordinator = {
    requestFor: vi.fn(grantingRequestFor),
  };
  const connect: CaptureOrchestrator['connect'] = (command) =>
    okAsync({
      sessionIdentifier: command.sessionIdentifier,
      sourceType: command.sourceType,
      stream: new MediaStream(),
      frameChannel: {
        frames: {
          [Symbol.asyncIterator]: (): AsyncIterator<never> => ({
            next: (): Promise<IteratorReturnResult<undefined>> =>
              Promise.resolve({ done: true, value: undefined }),
          }),
        },
        close: () => undefined,
      },
    });
  const captureOrchestrator: CaptureOrchestrator = {
    connect: vi.fn(connect),
    disconnect: vi.fn(() => okAsync(undefined)),
  };
  const relaySessionSubscriber: RelaySessionSubscriber = {
    start: vi.fn(),
    stop: vi.fn(),
    stopAll: vi.fn(),
    activeCount: vi.fn(() => 0),
  };
  const audioFramePump: AudioFramePump = {
    start: vi.fn(),
    stop: vi.fn(),
    stopAll: vi.fn(),
    activeCount: vi.fn(() => 0),
  };
  return {
    sourceSessionRepository,
    extensionProfileRepository,
    relayGateway,
    permissionCoordinator,
    captureOrchestrator,
    relaySessionSubscriber,
    audioFramePump,
    clock: () => STARTED_AT,
    idFactory: {
      session: () => SESSION_ID,
      source: () => SOURCE_ID,
    },
    ...overrides,
  };
};

const buildSessionIdle = (
  sessionId: string = SESSION_ID,
  sourceId: string = SOURCE_ID,
): SourceSession =>
  createSourceSession({
    sessionIdentifier: sessionId,
    sourceIdentifier: sourceId,
    sourceType: 'tab',
    languagePair: createLanguagePair({ source: 'en-US', target: 'ja-JP' })._unsafeUnwrap(),
    startedAt: STARTED_AT,
  })._unsafeUnwrap();

describe('createStartSourceSessionUseCase (IMPL-210, DD-301)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {
      /* silence */
    });
  });

  it('starts a session and transitions to connecting on granted permission', async () => {
    const deps = buildDependencies();
    const useCase = createStartSourceSessionUseCase(deps);
    const result = await useCase({
      sourceType: 'tab',
      displayName: 'Example tab',
      sourceLanguage: 'en-US',
      autoDetectLanguage: false,
      targetLanguage: 'ja-JP',
      overlayTarget: { kind: 'tab', tabId: 1 },
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.sessionId).toBe(SESSION_ID);
      expect(result.value.state).toBe('connecting');
      expect(result.value.startedAt).toBe(STARTED_AT);
    }
    expect(deps.sourceSessionRepository.save).toHaveBeenCalledTimes(2);
    expect(deps.relayGateway.openSession).toHaveBeenCalledTimes(1);
    expect(deps.audioFramePump.start).toHaveBeenCalledTimes(1);
    const startCalls = vi.mocked(deps.audioFramePump.start).mock.calls;
    const firstCall = startCalls[0];
    expect(firstCall).toBeDefined();
    if (firstCall !== undefined) {
      const [sessionArg, channelArg, sendFrameArg] = firstCall;
      expect(sessionArg).toBe(SESSION_ID);
      expect(channelArg).toHaveProperty('frames');
      expect(channelArg).toHaveProperty('close');
      expect(typeof sendFrameArg).toBe('function');
    }
    expect(deps.relaySessionSubscriber.start).toHaveBeenCalledWith(SESSION_ID);
  });

  it('wires sendFrame callback to relayGateway.sendAudioFrame', async () => {
    const deps = buildDependencies();
    const useCase = createStartSourceSessionUseCase(deps);
    const result = await useCase({
      sourceType: 'tab',
      displayName: 'Example tab',
      sourceLanguage: 'en-US',
      autoDetectLanguage: false,
      targetLanguage: 'ja-JP',
      overlayTarget: { kind: 'tab', tabId: 1 },
    });
    expect(result.isOk()).toBe(true);
    const pumpStartMock = vi.mocked(deps.audioFramePump.start);
    expect(pumpStartMock).toHaveBeenCalledTimes(1);
    const sendFrameCallback = pumpStartMock.mock.calls[0]?.[2];
    expect(typeof sendFrameCallback).toBe('function');
    const frame: AudioFrameEnvelope = {
      sessionIdentifier: parseSessionIdentifier(SESSION_ID)._unsafeUnwrap(),
      sequenceNumber: 1,
      sampleRate: 16000,
      channels: 1,
      pcm16Base64: 'AAAA',
      capturedAt: STARTED_AT,
      durationMs: 100,
    };
    if (sendFrameCallback !== undefined) {
      await sendFrameCallback(frame);
    }
    expect(deps.relayGateway.sendAudioFrame).toHaveBeenCalledWith(frame);
  });

  it('rejects when concurrent session limit is reached', async () => {
    const existing = [
      buildSessionIdle(),
      buildSessionIdle('01HZX8Y1R8M7D3Q2P4T5V6W7A2', '01HZX8Y1R8M7D3Q2P4T5V6W7B2'),
      buildSessionIdle('01HZX8Y1R8M7D3Q2P4T5V6W7A3', '01HZX8Y1R8M7D3Q2P4T5V6W7B3'),
    ];
    const deps = buildDependencies({
      sourceSessionRepository: {
        findById: vi.fn(() => okAsync(buildSessionIdle())),
        findActiveSessions: vi.fn(() => okAsync(existing)),
        save: vi.fn(() => okAsync(undefined)),
      },
    });
    const useCase = createStartSourceSessionUseCase(deps);
    const result = await useCase({
      sourceType: 'tab',
      displayName: 'over limit',
      autoDetectLanguage: false,
      targetLanguage: 'ja-JP',
      overlayTarget: { kind: 'tab' },
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.type).toBe('conflict');
  });

  it('returns permission-required when user denies capture', async () => {
    const denyingRequestFor: PermissionCoordinator['requestFor'] = (sourceType) =>
      okAsync({ status: 'denied', sourceType, reason: 'user-dismissed' });
    const deps = buildDependencies({
      permissionCoordinator: {
        requestFor: vi.fn(denyingRequestFor),
      },
    });
    const useCase = createStartSourceSessionUseCase(deps);
    const result = await useCase({
      sourceType: 'microphone',
      displayName: 'mic',
      autoDetectLanguage: false,
      targetLanguage: 'ja-JP',
      overlayTarget: { kind: 'extension-monitor' },
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('permission-required');
      if (result.error.type === 'permission-required') {
        expect(result.error.sourceType).toBe('microphone');
      }
    }
    // Session is persisted in error state before returning permission-required
    expect(deps.sourceSessionRepository.save).toHaveBeenCalledTimes(2);
    expect(deps.relayGateway.openSession).not.toHaveBeenCalled();
    expect(deps.audioFramePump.start).not.toHaveBeenCalled();
  });

  it('falls back to profile defaults when sourceLanguage is null', async () => {
    const deps = buildDependencies();
    const useCase = createStartSourceSessionUseCase(deps);
    const result = await useCase({
      sourceType: 'tab',
      displayName: 'auto',
      sourceLanguage: null,
      autoDetectLanguage: true,
      targetLanguage: 'ja-JP',
      overlayTarget: { kind: 'tab' },
    });
    expect(result.isOk()).toBe(true);
  });

  it('returns validation error when input is malformed', async () => {
    const deps = buildDependencies();
    const useCase = createStartSourceSessionUseCase(deps);
    const result = await useCase({
      sourceType: 'tab',
      displayName: '',
      autoDetectLanguage: false,
      targetLanguage: 'ja-JP',
      overlayTarget: { kind: 'tab' },
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.type).toBe('validation');
  });

  it('returns session-not-found when extension profile is missing', async () => {
    const deps = buildDependencies({
      extensionProfileRepository: {
        getDefault: vi.fn(() =>
          errAsync<ExtensionProfile, DomainError>(
            notFoundError({ resourceType: 'ExtensionProfile', identifier: 'default' }),
          ),
        ),
        save: vi.fn(() => okAsync(undefined)),
      },
    });
    const useCase = createStartSourceSessionUseCase(deps);
    const result = await useCase({
      sourceType: 'tab',
      displayName: 'tab',
      autoDetectLanguage: false,
      targetLanguage: 'ja-JP',
      overlayTarget: { kind: 'tab' },
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.type).toBe('session-not-found');
  });

  it('propagates relay handshake failure as conflict', async () => {
    const deps = buildDependencies({
      relayGateway: {
        openSession: vi.fn(() =>
          errAsync<void, DomainError>(
            invariantViolationError({ invariant: 'relay-handshake-failed', details: 'x' }),
          ),
        ),
        sendAudioFrame: vi.fn(() => okAsync(undefined)),
        closeSession: vi.fn(() => okAsync(undefined)),
        subscribe: vi.fn(() => () => {
          /* noop */
        }),
      },
    });
    const useCase = createStartSourceSessionUseCase(deps);
    const result = await useCase({
      sourceType: 'tab',
      displayName: 'tab',
      autoDetectLanguage: false,
      targetLanguage: 'ja-JP',
      overlayTarget: { kind: 'tab' },
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.type).toBe('conflict');
  });
});
