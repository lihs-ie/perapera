import { errAsync, okAsync } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLanguagePair } from '../domain/session/language-pair';
import { createSourceSession, type SourceSession } from '../domain/session/source-session';
import { invariantViolationError } from '../domain/shared/errors';
import {
  OPEN_MAIN_WINDOW_COMMAND,
  STOP_ACTIVE_SESSION_COMMAND,
  registerKeyboardCommandHandler,
  type ChromeCommandsApi,
  type KeyboardCommandHandlerDependencies,
} from './keyboard-command-handler';

const SESSION_ID_A = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const SESSION_ID_B = '01HZX8Y1R8M7D3Q2P4T5V6W7A2';
const SOURCE_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7B1';

const buildSession = (sessionId: string): SourceSession =>
  createSourceSession({
    sessionIdentifier: sessionId,
    sourceIdentifier: SOURCE_ID,
    sourceType: 'tab',
    languagePair: createLanguagePair({ source: 'en-US', target: 'ja-JP' })._unsafeUnwrap(),
    startedAt: '2026-04-21T00:00:00.000Z',
  })._unsafeUnwrap();

type ListenerCapture = {
  listener: (command: string) => void;
  captured: boolean;
};

const buildCommandsApi = (capture: ListenerCapture): ChromeCommandsApi => ({
  onCommand: {
    addListener: (listener) => {
      capture.listener = listener;
      capture.captured = true;
    },
  },
});

const buildDependencies = (
  overrides: Partial<KeyboardCommandHandlerDependencies> = {},
): { deps: KeyboardCommandHandlerDependencies; capture: ListenerCapture } => {
  const capture: ListenerCapture = { listener: () => undefined, captured: false };
  const deps: KeyboardCommandHandlerDependencies = {
    commandsApi: buildCommandsApi(capture),
    mainWindowLifecycle: {
      openOrFocus: vi.fn(() => Promise.resolve()),
    },
    sessionCommandService: {
      stopSource: vi.fn(() =>
        okAsync({
          sessionId: SESSION_ID_A,
          state: 'stopped',
          stoppedAt: '2026-04-21T00:10:00.000Z',
        }),
      ),
    },
    sourceSessionRepository: {
      findActiveSessions: vi.fn(() => okAsync([])),
    },
    logWarn: vi.fn(),
    logInfo: vi.fn(),
    ...overrides,
  };
  return { deps, capture };
};

describe('registerKeyboardCommandHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers a listener on chrome.commands.onCommand', () => {
    const { deps, capture } = buildDependencies();
    registerKeyboardCommandHandler(deps);
    expect(capture.captured).toBe(true);
  });

  it('invokes MainWindowLifecycle.openOrFocus on open-main-window command', () => {
    const { deps, capture } = buildDependencies();
    registerKeyboardCommandHandler(deps);
    capture.listener(OPEN_MAIN_WINDOW_COMMAND);
    expect(deps.mainWindowLifecycle.openOrFocus).toHaveBeenCalledTimes(1);
  });

  it('logs warning when openOrFocus rejects', async () => {
    const logWarn = vi.fn();
    const { deps, capture } = buildDependencies({
      mainWindowLifecycle: {
        openOrFocus: vi.fn(() => Promise.reject(new Error('window boom'))),
      },
      logWarn,
    });
    registerKeyboardCommandHandler(deps);
    capture.listener(OPEN_MAIN_WINDOW_COMMAND);
    await Promise.resolve();
    await Promise.resolve();
    expect(logWarn).toHaveBeenCalled();
  });

  it('calls stopSource for each active session on stop-active-session command', async () => {
    const activeA = buildSession(SESSION_ID_A);
    const activeB = buildSession(SESSION_ID_B);
    const stopSource = vi.fn(() =>
      okAsync({
        sessionId: SESSION_ID_A,
        state: 'stopped',
        stoppedAt: '2026-04-21T00:10:00.000Z',
      }),
    );
    const { deps, capture } = buildDependencies({
      sourceSessionRepository: {
        findActiveSessions: vi.fn(() => okAsync([activeA, activeB])),
      },
      sessionCommandService: {
        stopSource,
      },
    });
    registerKeyboardCommandHandler(deps);
    capture.listener(STOP_ACTIVE_SESSION_COMMAND);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(stopSource).toHaveBeenCalledTimes(2);
    expect(stopSource).toHaveBeenNthCalledWith(1, { sessionId: SESSION_ID_A });
    expect(stopSource).toHaveBeenNthCalledWith(2, { sessionId: SESSION_ID_B });
  });

  it('no-op (no error) when there are no active sessions', async () => {
    const stopSource = vi.fn(() =>
      okAsync({
        sessionId: SESSION_ID_A,
        state: 'stopped',
        stoppedAt: '2026-04-21T00:10:00.000Z',
      }),
    );
    const logInfo = vi.fn();
    const { deps, capture } = buildDependencies({
      sourceSessionRepository: {
        findActiveSessions: vi.fn(() => okAsync([])),
      },
      sessionCommandService: { stopSource },
      logInfo,
    });
    registerKeyboardCommandHandler(deps);
    capture.listener(STOP_ACTIVE_SESSION_COMMAND);
    await Promise.resolve();
    await Promise.resolve();
    expect(stopSource).not.toHaveBeenCalled();
    expect(
      logInfo.mock.calls.some(
        (call) => typeof call[0] === 'string' && call[0].includes('no active session'),
      ),
    ).toBe(true);
  });

  it('logs warning when findActiveSessions fails', async () => {
    const logWarn = vi.fn();
    const { deps, capture } = buildDependencies({
      sourceSessionRepository: {
        findActiveSessions: vi.fn(() =>
          errAsync(
            invariantViolationError({
              invariant: 'storage-read-integrity',
              details: 'boom',
            }),
          ),
        ),
      },
      logWarn,
    });
    registerKeyboardCommandHandler(deps);
    capture.listener(STOP_ACTIVE_SESSION_COMMAND);
    await Promise.resolve();
    await Promise.resolve();
    expect(logWarn).toHaveBeenCalled();
  });

  it('logs warning when stopSource returns err for a session', async () => {
    const logWarn = vi.fn();
    const active = buildSession(SESSION_ID_A);
    const { deps, capture } = buildDependencies({
      sourceSessionRepository: {
        findActiveSessions: vi.fn(() => okAsync([active])),
      },
      sessionCommandService: {
        stopSource: vi.fn(() =>
          errAsync({
            type: 'internal' as const,
            code: 'INTERNAL_ERROR' as const,
            message: 'stop failed',
          }),
        ),
      },
      logWarn,
    });
    registerKeyboardCommandHandler(deps);
    capture.listener(STOP_ACTIVE_SESSION_COMMAND);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(logWarn).toHaveBeenCalled();
  });

  it('ignores unknown command names without throwing', () => {
    const { deps, capture } = buildDependencies();
    registerKeyboardCommandHandler(deps);
    expect(() => {
      capture.listener('some-future-unknown-command');
    }).not.toThrow();
    expect(deps.mainWindowLifecycle.openOrFocus).not.toHaveBeenCalled();
    expect(deps.sourceSessionRepository.findActiveSessions).not.toHaveBeenCalled();
  });
});
