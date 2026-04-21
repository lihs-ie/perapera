import { errAsync, okAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import {
  parseSessionIdentifier,
  type SessionIdentifier,
} from '../../domain/session/session-identifier';
import { invariantViolationError } from '../../domain/shared/errors';
import { type AudioFrameChannel, type AudioPreprocessor } from '../ports/audio-preprocessor';
import {
  type SourceAdapter,
  type SourceAdapterFactory,
  type StartSourceCommand,
} from '../ports/source-adapter';
import { createCaptureOrchestrator } from './capture-orchestrator';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const sessionIdentifier: SessionIdentifier = parseSessionIdentifier(SESSION_ID)._unsafeUnwrap();

const buildCommand = (): StartSourceCommand => ({
  sourceType: 'microphone',
  sessionIdentifier,
  deviceId: 'default',
});

const buildFrameChannel = (): AudioFrameChannel & { close: ReturnType<typeof vi.fn> } => ({
  frames: {
    [Symbol.asyncIterator]: () => ({
      next: () => Promise.resolve({ done: true as const, value: undefined }),
    }),
  },
  close: vi.fn(),
});

const buildAdapter = (): SourceAdapter & {
  open: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
} => {
  const stream = new MediaStream();
  const open = vi.fn(() => okAsync<MediaStream, never>(stream));
  const close = vi.fn(() => okAsync<void, never>(undefined));
  return { open, close };
};

const buildFactory = (
  adapter: SourceAdapter,
): SourceAdapterFactory & {
  create: ReturnType<typeof vi.fn>;
} => {
  const create = vi.fn(() => adapter);
  return { create };
};

const buildPreprocessor = (
  channel: AudioFrameChannel,
): AudioPreprocessor & {
  attach: ReturnType<typeof vi.fn>;
  detach: ReturnType<typeof vi.fn>;
} => ({
  attach: vi.fn(() => okAsync<AudioFrameChannel, never>(channel)),
  detach: vi.fn(() => okAsync<void, never>(undefined)),
});

describe('createCaptureOrchestrator (IMPL-341)', () => {
  it('connect opens the adapter and attaches preprocessor, returning ActiveCapture', async () => {
    const adapter = buildAdapter();
    const factory = buildFactory(adapter);
    const channel = buildFrameChannel();
    const preprocessor = buildPreprocessor(channel);
    const orchestrator = createCaptureOrchestrator({
      sourceAdapterFactory: factory,
      audioPreprocessor: preprocessor,
    });
    const result = await orchestrator.connect(buildCommand());
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.sessionIdentifier).toBe(sessionIdentifier);
      expect(result.value.frameChannel).toBe(channel);
    }
    expect(factory.create).toHaveBeenCalledWith('microphone');
    expect(adapter.open).toHaveBeenCalledTimes(1);
    expect(preprocessor.attach).toHaveBeenCalledTimes(1);
  });

  it('connect surfaces adapter open failure', async () => {
    const adapter: SourceAdapter = {
      open: () =>
        errAsync(invariantViolationError({ invariant: 'source-open-failed', details: 'boom' })),
      close: () => okAsync<void, never>(undefined),
    };
    const orchestrator = createCaptureOrchestrator({
      sourceAdapterFactory: buildFactory(adapter),
      audioPreprocessor: buildPreprocessor(buildFrameChannel()),
    });
    const result = await orchestrator.connect(buildCommand());
    expect(result.isErr()).toBe(true);
  });

  it('connect surfaces preprocessor attach failure', async () => {
    const adapter = buildAdapter();
    const factory = buildFactory(adapter);
    const preprocessor: AudioPreprocessor = {
      attach: () =>
        errAsync(
          invariantViolationError({
            invariant: 'audio-context-unavailable',
            details: 'no AudioContext',
          }),
        ),
      detach: () => okAsync<void, never>(undefined),
    };
    const orchestrator = createCaptureOrchestrator({
      sourceAdapterFactory: factory,
      audioPreprocessor: preprocessor,
    });
    const result = await orchestrator.connect(buildCommand());
    expect(result.isErr()).toBe(true);
  });

  it('disconnect closes the frame channel and the adapter', async () => {
    const adapter = buildAdapter();
    const factory = buildFactory(adapter);
    const channel = buildFrameChannel();
    const preprocessor = buildPreprocessor(channel);
    const orchestrator = createCaptureOrchestrator({
      sourceAdapterFactory: factory,
      audioPreprocessor: preprocessor,
    });
    await orchestrator.connect(buildCommand());
    const result = await orchestrator.disconnect(sessionIdentifier);
    expect(result.isOk()).toBe(true);
    expect(channel.close).toHaveBeenCalledTimes(1);
    expect(preprocessor.detach).toHaveBeenCalledWith(sessionIdentifier);
    expect(adapter.close).toHaveBeenCalledWith(sessionIdentifier);
  });

  it('disconnect is a no-op for an unknown session', async () => {
    const adapter = buildAdapter();
    const preprocessor = buildPreprocessor(buildFrameChannel());
    const orchestrator = createCaptureOrchestrator({
      sourceAdapterFactory: buildFactory(adapter),
      audioPreprocessor: preprocessor,
    });
    const result = await orchestrator.disconnect(sessionIdentifier);
    expect(result.isOk()).toBe(true);
    expect(preprocessor.detach).not.toHaveBeenCalled();
    expect(adapter.close).not.toHaveBeenCalled();
  });

  it('disconnect after a failed connect is still a no-op', async () => {
    const adapter: SourceAdapter = {
      open: () =>
        errAsync(invariantViolationError({ invariant: 'source-open-failed', details: 'boom' })),
      close: vi.fn(() => okAsync<void, never>(undefined)),
    };
    const preprocessor = buildPreprocessor(buildFrameChannel());
    const orchestrator = createCaptureOrchestrator({
      sourceAdapterFactory: buildFactory(adapter),
      audioPreprocessor: preprocessor,
    });
    await orchestrator.connect(buildCommand());
    const result = await orchestrator.disconnect(sessionIdentifier);
    expect(result.isOk()).toBe(true);
    expect(preprocessor.detach).not.toHaveBeenCalled();
  });
});
