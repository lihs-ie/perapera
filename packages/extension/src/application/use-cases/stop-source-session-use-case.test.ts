import { errAsync, okAsync } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLanguagePair } from '../../domain/session/language-pair';
import { createSourceSession } from '../../domain/session/source-session';
import {
  invariantViolationError,
  notFoundError,
  type DomainError,
} from '../../domain/shared/errors';
import type { OverlayPresenter } from '../ports/overlay-presenter';
import type { RelayGateway } from '../ports/relay-gateway';
import type { SourceSessionRepository } from '../../domain/repositories/source-session-repository';
import type { SourceSession } from '../../domain/session/source-session';
import type { AudioFramePump } from '../services/audio-frame-pump';
import type { CaptureOrchestrator } from '../services/capture-orchestrator';
import type { OffscreenCommandSender } from '../services/offscreen-command-sender';
import type { RelaySessionSubscriber } from '../services/relay-session-subscriber';
import {
  createStopSourceSessionUseCase,
  type StopSourceSessionDependencies,
} from './stop-source-session-use-case';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const SOURCE_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7B1';
const STOPPED_AT = '2026-04-21T00:10:00.000Z';

const buildActiveSession = (): SourceSession => {
  const session = createSourceSession({
    sessionIdentifier: SESSION_ID,
    sourceIdentifier: SOURCE_ID,
    sourceType: 'tab',
    languagePair: createLanguagePair({ source: 'en-US', target: 'ja-JP' })._unsafeUnwrap(),
    startedAt: '2026-04-21T00:00:00.000Z',
  })._unsafeUnwrap();
  return session;
};

const buildDependencies = (
  overrides: Partial<StopSourceSessionDependencies> = {},
): StopSourceSessionDependencies => {
  const sourceSessionRepository: SourceSessionRepository = {
    findById: vi.fn(() => okAsync(buildActiveSession())),
    findActiveSessions: vi.fn(() => okAsync([])),
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
  const overlayPresenter: OverlayPresenter = {
    mount: vi.fn(() => okAsync(undefined)),
    render: vi.fn(() => okAsync(undefined)),
    updateSettings: vi.fn(() => okAsync(undefined)),
    unmount: vi.fn(() => okAsync(undefined)),
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
  const offscreenCommandSender: OffscreenCommandSender = {
    openAudioContext: vi.fn(() => okAsync(undefined)),
    closeAudioContext: vi.fn(() => okAsync(undefined)),
    ping: vi.fn(() => okAsync(undefined)),
  };
  return {
    sourceSessionRepository,
    relayGateway,
    overlayPresenter,
    captureOrchestrator,
    relaySessionSubscriber,
    audioFramePump,
    offscreenCommandSender,
    clock: () => STOPPED_AT,
    ...overrides,
  };
};

describe('createStopSourceSessionUseCase (IMPL-215, DD-306)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {
      /* silence */
    });
  });

  it('stops an active session and returns the terminal state output', async () => {
    const deps = buildDependencies();
    const useCase = createStopSourceSessionUseCase(deps);
    const result = await useCase({ sessionId: SESSION_ID, reason: 'user_requested' });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.sessionId).toBe(SESSION_ID);
      expect(result.value.state).toBe('stopped');
      expect(result.value.stoppedAt).toBe(STOPPED_AT);
    }
    expect(deps.sourceSessionRepository.save).toHaveBeenCalledTimes(1);
    expect(deps.relayGateway.closeSession).toHaveBeenCalledTimes(1);
    expect(deps.overlayPresenter.unmount).toHaveBeenCalledTimes(1);
    expect(deps.audioFramePump.stop).toHaveBeenCalledWith(SESSION_ID);
    expect(deps.relaySessionSubscriber.stop).toHaveBeenCalledWith(SESSION_ID);
    expect(deps.offscreenCommandSender.closeAudioContext).toHaveBeenCalledWith(SESSION_ID);
  });

  it('returns validation error when input is invalid', async () => {
    const deps = buildDependencies();
    const useCase = createStopSourceSessionUseCase(deps);
    const result = await useCase({ sessionId: '' });
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
        save: vi.fn(() => okAsync(undefined)),
      },
    });
    const useCase = createStopSourceSessionUseCase(deps);
    const result = await useCase({ sessionId: SESSION_ID });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.type).toBe('session-not-found');
  });

  it('returns conflict error when attempting to stop an already-stopped session', async () => {
    const alreadyStopped = buildActiveSession();
    const stopped = { ...alreadyStopped, state: 'stopped' as const, stoppedAt: STOPPED_AT };
    const deps = buildDependencies({
      sourceSessionRepository: {
        findById: vi.fn(() => okAsync(stopped)),
        findActiveSessions: vi.fn(() => okAsync([])),
        save: vi.fn(() => okAsync(undefined)),
      },
    });
    const useCase = createStopSourceSessionUseCase(deps);
    const result = await useCase({ sessionId: SESSION_ID });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.type).toBe('conflict');
  });

  it('still succeeds when relayGateway.closeSession fails (fire-and-forget semantics)', async () => {
    const deps = buildDependencies({
      relayGateway: {
        openSession: vi.fn(() => okAsync(undefined)),
        sendAudioFrame: vi.fn(() => okAsync(undefined)),
        closeSession: vi.fn(() =>
          errAsync<void, DomainError>(
            invariantViolationError({ invariant: 'relay-close-failed', details: 'socket error' }),
          ),
        ),
        subscribe: vi.fn(() => () => {
          /* noop */
        }),
      },
    });
    const useCase = createStopSourceSessionUseCase(deps);
    const result = await useCase({ sessionId: SESSION_ID });
    expect(result.isOk()).toBe(true);
  });

  it('suppresses closeAudioContext warn when offscreen receiver is already gone (teardown race)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
      /* swallow */
    });
    try {
      const deps = buildDependencies({
        offscreenCommandSender: {
          openAudioContext: vi.fn(() => okAsync<void, DomainError>(undefined)),
          closeAudioContext: vi.fn(() =>
            errAsync<void, DomainError>(
              invariantViolationError({
                invariant: 'chrome-runtime-message-bridge',
                details: 'Could not establish connection. Receiving end does not exist.',
              }),
            ),
          ),
          ping: vi.fn(() => okAsync<void, DomainError>(undefined)),
        },
      });
      const useCase = createStopSourceSessionUseCase(deps);
      const result = await useCase({ sessionId: SESSION_ID });
      // fire-and-forget の match は microtask で評価されるため、microtask を
      // 1 周 flush してからログを検査する。
      await new Promise<void>((resolve) => {
        queueMicrotask(resolve);
      });
      expect(result.isOk()).toBe(true);
      const closeAudioContextWarned = warnSpy.mock.calls.some((call) =>
        call.some(
          (arg) =>
            typeof arg === 'string' && arg.includes('offscreenCommandSender.closeAudioContext'),
        ),
      );
      expect(closeAudioContextWarned).toBe(false);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('still warns on closeAudioContext errors not matching the teardown pattern', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
      /* swallow */
    });
    try {
      const deps = buildDependencies({
        offscreenCommandSender: {
          openAudioContext: vi.fn(() => okAsync<void, DomainError>(undefined)),
          closeAudioContext: vi.fn(() =>
            errAsync<void, DomainError>(
              invariantViolationError({
                invariant: 'offscreen-audio-host',
                details: 'AudioContext unexpectedly throws on close',
              }),
            ),
          ),
          ping: vi.fn(() => okAsync<void, DomainError>(undefined)),
        },
      });
      const useCase = createStopSourceSessionUseCase(deps);
      const result = await useCase({ sessionId: SESSION_ID });
      await new Promise<void>((resolve) => {
        queueMicrotask(resolve);
      });
      expect(result.isOk()).toBe(true);
      const closeAudioContextWarned = warnSpy.mock.calls.some((call) =>
        call.some(
          (arg) =>
            typeof arg === 'string' && arg.includes('offscreenCommandSender.closeAudioContext'),
        ),
      );
      expect(closeAudioContextWarned).toBe(true);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('propagates save errors as conflict application errors', async () => {
    const deps = buildDependencies({
      sourceSessionRepository: {
        findById: vi.fn(() => okAsync(buildActiveSession())),
        findActiveSessions: vi.fn(() => okAsync([])),
        save: vi.fn(() =>
          errAsync<void, DomainError>(
            invariantViolationError({ invariant: 'storage-write-failed', details: 'quota' }),
          ),
        ),
      },
    });
    const useCase = createStopSourceSessionUseCase(deps);
    const result = await useCase({ sessionId: SESSION_ID });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.type).toBe('conflict');
  });
});
