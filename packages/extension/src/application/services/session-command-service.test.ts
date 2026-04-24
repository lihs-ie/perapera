import { errAsync, okAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import { parseSessionIdentifier } from '../../domain/session/session-identifier';
import { type HandleTranscriptFinalOutput } from '../dto/handle-transcript-final-dto';
import { type HandleTranscriptPartialOutput } from '../dto/handle-transcript-partial-dto';
import {
  type StartSourceSessionInput,
  type StartSourceSessionOutput,
} from '../dto/start-source-session-dto';
import {
  type StopSourceSessionInput,
  type StopSourceSessionOutput,
} from '../dto/stop-source-session-dto';
import {
  type UpdateSourceSettingsInput,
  type UpdateSourceSettingsOutput,
} from '../dto/update-source-settings-dto';
import { internalAppError, sessionNotFoundAppError } from '../errors/application-errors';
import { type RelayEvent } from '../ports/relay-gateway';
import { type SessionStateBroadcaster } from '../ports/session-state-broadcaster';
import { type HandleTranscriptFinalUseCase } from '../use-cases/handle-transcript-final-use-case';
import { type HandleTranscriptPartialUseCase } from '../use-cases/handle-transcript-partial-use-case';
import { type StartSourceSessionUseCase } from '../use-cases/start-source-session-use-case';
import { type StopSourceSessionUseCase } from '../use-cases/stop-source-session-use-case';
import { type UpdateSourceSettingsUseCase } from '../use-cases/update-source-settings-use-case';
import { createSessionCommandService } from './session-command-service';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const sessionIdentifier = parseSessionIdentifier(SESSION_ID)._unsafeUnwrap();
const SEGMENT_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7B1';
const TRANSLATION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7C1';

const clock = () => 1_700_000_000_000;

const startInput: StartSourceSessionInput = {
  sourceType: 'microphone',
  displayName: 'Mic',
  autoDetectLanguage: false,
  targetLanguage: 'ja-JP',
  overlayTarget: { kind: 'extension-monitor' },
};
const stopInput: StopSourceSessionInput = { sessionId: SESSION_ID };
const updateInput: UpdateSourceSettingsInput = { sessionId: SESSION_ID };

type Mocks = {
  startSourceSessionUseCase: ReturnType<typeof vi.fn<StartSourceSessionUseCase>>;
  stopSourceSessionUseCase: ReturnType<typeof vi.fn<StopSourceSessionUseCase>>;
  updateSourceSettingsUseCase: ReturnType<typeof vi.fn<UpdateSourceSettingsUseCase>>;
  handleTranscriptPartialUseCase: ReturnType<typeof vi.fn<HandleTranscriptPartialUseCase>>;
  handleTranscriptFinalUseCase: ReturnType<typeof vi.fn<HandleTranscriptFinalUseCase>>;
  sessionStateBroadcaster: SessionStateBroadcaster & {
    broadcast: ReturnType<typeof vi.fn<SessionStateBroadcaster['broadcast']>>;
  };
};

const buildMocks = (): Mocks => ({
  startSourceSessionUseCase: vi.fn<StartSourceSessionUseCase>(() =>
    okAsync<StartSourceSessionOutput, never>({
      sessionId: SESSION_ID,
      state: 'connecting',
      startedAt: '2026-04-21T00:00:00.000Z',
    }),
  ),
  stopSourceSessionUseCase: vi.fn<StopSourceSessionUseCase>(() =>
    okAsync<StopSourceSessionOutput, never>({
      sessionId: SESSION_ID,
      state: 'stopped',
      stoppedAt: '2026-04-21T00:01:00.000Z',
    }),
  ),
  updateSourceSettingsUseCase: vi.fn<UpdateSourceSettingsUseCase>(() =>
    okAsync<UpdateSourceSettingsOutput, never>({
      sessionId: SESSION_ID,
      appliedAt: '2026-04-21T00:00:30.000Z',
    }),
  ),
  handleTranscriptPartialUseCase: vi.fn<HandleTranscriptPartialUseCase>(() =>
    okAsync<HandleTranscriptPartialOutput, never>({
      sessionId: SESSION_ID,
      segmentId: SEGMENT_ID,
      revision: 1,
      renderModel: {
        sessionIdentifier,
        lines: [],
      },
    }),
  ),
  handleTranscriptFinalUseCase: vi.fn<HandleTranscriptFinalUseCase>(() =>
    okAsync<HandleTranscriptFinalOutput, never>({
      sessionId: SESSION_ID,
      segmentId: SEGMENT_ID,
      translationStatus: 'pending',
      renderModel: {
        sessionIdentifier,
        lines: [],
      },
    }),
  ),
  sessionStateBroadcaster: {
    broadcast: vi.fn<SessionStateBroadcaster['broadcast']>(() => okAsync<void, never>(undefined)),
  },
});

describe('createSessionCommandService (IMPL-340)', () => {
  it('startSource delegates to StartSourceSessionUseCase', async () => {
    const mocks = buildMocks();
    const service = createSessionCommandService({ ...mocks, clock });
    const result = await service.startSource(startInput);
    expect(result.isOk()).toBe(true);
    expect(mocks.startSourceSessionUseCase).toHaveBeenCalledWith(startInput);
  });

  it('stopSource delegates to StopSourceSessionUseCase', async () => {
    const mocks = buildMocks();
    const service = createSessionCommandService({ ...mocks, clock });
    const result = await service.stopSource(stopInput);
    expect(result.isOk()).toBe(true);
    expect(mocks.stopSourceSessionUseCase).toHaveBeenCalledWith(stopInput);
  });

  it('applySourceSettings delegates to UpdateSourceSettingsUseCase', async () => {
    const mocks = buildMocks();
    const service = createSessionCommandService({ ...mocks, clock });
    const result = await service.applySourceSettings(updateInput);
    expect(result.isOk()).toBe(true);
    expect(mocks.updateSourceSettingsUseCase).toHaveBeenCalledWith(updateInput);
  });

  it('startSource propagates UseCase failures', async () => {
    const mocks = buildMocks();
    mocks.startSourceSessionUseCase.mockReturnValueOnce(
      errAsync(internalAppError({ message: 'boom' })),
    );
    const service = createSessionCommandService({ ...mocks, clock });
    const result = await service.startSource(startInput);
    expect(result.isErr()).toBe(true);
  });

  it('handleRelayEvent routes transcript.partial to HandleTranscriptPartialUseCase', async () => {
    const mocks = buildMocks();
    const service = createSessionCommandService({ ...mocks, clock });
    const event: RelayEvent = {
      type: 'transcript.partial',
      sessionIdentifier,
      segmentIdentifier: SEGMENT_ID,
      revision: 1,
      text: 'hello',
    };
    const result = await service.handleRelayEvent(event);
    expect(result.isOk()).toBe(true);
    expect(mocks.handleTranscriptPartialUseCase).toHaveBeenCalledTimes(1);
    const call = mocks.handleTranscriptPartialUseCase.mock.calls[0]?.[0];
    expect(call?.sessionId).toBe(SESSION_ID);
    expect(call?.segmentId).toBe(SEGMENT_ID);
    expect(call?.text).toBe('hello');
  });

  it('handleRelayEvent routes transcript.final to HandleTranscriptFinalUseCase (without translation)', async () => {
    const mocks = buildMocks();
    const service = createSessionCommandService({ ...mocks, clock });
    const event: RelayEvent = {
      type: 'transcript.final',
      sessionIdentifier,
      segmentIdentifier: SEGMENT_ID,
      text: 'hello',
      finalizedAt: '2026-04-21T00:00:15.000Z',
    };
    const result = await service.handleRelayEvent(event);
    expect(result.isOk()).toBe(true);
    expect(mocks.handleTranscriptFinalUseCase).toHaveBeenCalledTimes(1);
    const call = mocks.handleTranscriptFinalUseCase.mock.calls[0]?.[0];
    expect(call?.translation).toBeUndefined();
  });

  it('handleRelayEvent routes translation.final to HandleTranscriptFinalUseCase with translation payload', async () => {
    const mocks = buildMocks();
    const service = createSessionCommandService({ ...mocks, clock });
    const event: RelayEvent = {
      type: 'translation.final',
      sessionIdentifier,
      segmentIdentifier: SEGMENT_ID,
      translationIdentifier: TRANSLATION_ID,
      targetLanguage: 'ja',
      text: 'こんにちは',
    };
    const result = await service.handleRelayEvent(event);
    expect(result.isOk()).toBe(true);
    expect(mocks.handleTranscriptFinalUseCase).toHaveBeenCalledTimes(1);
    const call = mocks.handleTranscriptFinalUseCase.mock.calls[0]?.[0];
    expect(call?.translation?.status).toBe('completed');
    expect(call?.translation?.text).toBe('こんにちは');
  });

  it('handleRelayEvent returns ok for session.ready / session.state.changed (no transcript side-effect)', async () => {
    const mocks = buildMocks();
    const service = createSessionCommandService({ ...mocks, clock });
    const events: RelayEvent[] = [
      { type: 'session.ready', sessionIdentifier, heartbeatIntervalSec: 15 },
      { type: 'session.state.changed', sessionIdentifier, state: 'capturing' },
    ];
    for (const event of events) {
      const result = await service.handleRelayEvent(event);
      expect(result.isOk()).toBe(true);
    }
    expect(mocks.handleTranscriptPartialUseCase).not.toHaveBeenCalled();
    expect(mocks.handleTranscriptFinalUseCase).not.toHaveBeenCalled();
    expect(mocks.stopSourceSessionUseCase).not.toHaveBeenCalled();
  });

  it('handleRelayEvent auto-stops the session when session.error is received (PR #131 follow-up)', async () => {
    const mocks = buildMocks();
    const service = createSessionCommandService({ ...mocks, clock });
    const event: RelayEvent = {
      type: 'session.error',
      sessionIdentifier,
      code: 'STT_STREAM_FAILED',
      message: 'sendFrame failed: STT stream closed',
      retryable: true,
      fatal: false,
    };
    const result = await service.handleRelayEvent(event);
    expect(result.isOk()).toBe(true);
    expect(mocks.stopSourceSessionUseCase).toHaveBeenCalledWith({
      sessionId: sessionIdentifier,
    });
  });

  it('handleRelayEvent tolerates stopSource failure on session.error (logs, does not propagate)', async () => {
    const mocks = buildMocks();
    mocks.stopSourceSessionUseCase.mockReturnValueOnce(
      errAsync(sessionNotFoundAppError({ identifier: SESSION_ID, message: 'already stopped' })),
    );
    const service = createSessionCommandService({ ...mocks, clock });
    const event: RelayEvent = {
      type: 'session.error',
      sessionIdentifier,
      code: 'STT_STREAM_FAILED',
      message: 'boom',
      retryable: true,
      fatal: false,
    };
    const result = await service.handleRelayEvent(event);
    expect(result.isOk()).toBe(true);
  });

  it('handleRelayEvent broadcasts session.state.changed via SessionStateBroadcaster (Issue #108)', async () => {
    const mocks = buildMocks();
    const service = createSessionCommandService({ ...mocks, clock });
    const event: RelayEvent = {
      type: 'session.state.changed',
      sessionIdentifier,
      state: 'degraded',
    };
    const result = await service.handleRelayEvent(event);
    expect(result.isOk()).toBe(true);
    expect(mocks.sessionStateBroadcaster.broadcast).toHaveBeenCalledWith({
      sessionIdentifier,
      state: 'degraded',
      reason: null,
    });
  });

  it('handleRelayEvent surfaces UseCase failures', async () => {
    const mocks = buildMocks();
    mocks.handleTranscriptFinalUseCase.mockReturnValueOnce(
      errAsync(sessionNotFoundAppError({ identifier: SESSION_ID, message: 'no' })),
    );
    const service = createSessionCommandService({ ...mocks, clock });
    const event: RelayEvent = {
      type: 'transcript.final',
      sessionIdentifier,
      segmentIdentifier: SEGMENT_ID,
      text: 'hello',
      finalizedAt: '2026-04-21T00:00:15.000Z',
    };
    const result = await service.handleRelayEvent(event);
    expect(result.isErr()).toBe(true);
  });
});
