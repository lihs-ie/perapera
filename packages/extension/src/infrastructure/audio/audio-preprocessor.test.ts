import { describe, expect, it, vi } from 'vitest';
import {
  parseSessionIdentifier,
  type SessionIdentifier,
} from '../../domain/session/session-identifier';
import {
  createAudioPreprocessor,
  type AudioContextFactory,
  type AudioContextLike,
} from './audio-preprocessor';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const sessionIdentifier: SessionIdentifier = parseSessionIdentifier(SESSION_ID)._unsafeUnwrap();

type MockContext = AudioContextLike & {
  close: ReturnType<typeof vi.fn<AudioContextLike['close']>>;
  audioWorklet: { addModule: ReturnType<typeof vi.fn<(url: string) => Promise<void>>> };
  createMediaStreamSource: ReturnType<typeof vi.fn<AudioContextLike['createMediaStreamSource']>>;
};

const createMockContext = (): MockContext => {
  const ctx: MockContext = {
    sampleRate: 16000,
    audioWorklet: {
      addModule: vi.fn((_url: string) => Promise.resolve()),
    },
    close: vi.fn(() => Promise.resolve()),
    createMediaStreamSource: vi.fn((_stream: MediaStream) => ({
      connect: vi.fn(),
      disconnect: vi.fn(),
    })),
  };
  return ctx;
};

const buildFactory = (
  context: AudioContextLike,
): AudioContextFactory & ReturnType<typeof vi.fn<AudioContextFactory>> => {
  return vi.fn<AudioContextFactory>(() => context);
};

describe('createAudioPreprocessor (IMPL-303, DD-104)', () => {
  it('constructs an AudioContext via the injected factory at 16kHz', async () => {
    const ctx = createMockContext();
    const factory = buildFactory(ctx);
    const preprocessor = createAudioPreprocessor({
      audioContextFactory: factory,
      workletModuleUrl: 'https://example/audio-worklet.js',
      clock: () => 0,
    });

    const stream = new MediaStream();
    const result = await preprocessor.attach(stream, sessionIdentifier);
    expect(result.isOk()).toBe(true);
    expect(factory).toHaveBeenCalledTimes(1);
    const options = factory.mock.calls[0]?.[0];
    expect(options).toMatchObject({ sampleRate: 16000 });
  });

  it('loads the AudioWorklet module from the injected URL', async () => {
    const ctx = createMockContext();
    const preprocessor = createAudioPreprocessor({
      audioContextFactory: buildFactory(ctx),
      workletModuleUrl: 'https://example/audio-worklet.js',
      clock: () => 0,
    });
    await preprocessor.attach(new MediaStream(), sessionIdentifier);
    expect(ctx.audioWorklet.addModule).toHaveBeenCalledWith('https://example/audio-worklet.js');
  });

  it('returns invariantViolationError when addModule rejects', async () => {
    const ctx = createMockContext();
    ctx.audioWorklet.addModule.mockRejectedValue(new Error('module load failed'));
    const preprocessor = createAudioPreprocessor({
      audioContextFactory: buildFactory(ctx),
      workletModuleUrl: 'https://example/audio-worklet.js',
      clock: () => 0,
    });
    const result = await preprocessor.attach(new MediaStream(), sessionIdentifier);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('invariant-violation');
  });

  it('attach returns an AudioFrameChannel with AsyncIterable frames', async () => {
    const ctx = createMockContext();
    const preprocessor = createAudioPreprocessor({
      audioContextFactory: buildFactory(ctx),
      workletModuleUrl: 'https://example/worklet.js',
      clock: () => 0,
    });
    const result = await preprocessor.attach(new MediaStream(), sessionIdentifier);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(typeof result.value.close).toBe('function');
      expect(Symbol.asyncIterator in result.value.frames).toBe(true);
    }
  });

  it('detach closes the AudioContext', async () => {
    const ctx = createMockContext();
    const preprocessor = createAudioPreprocessor({
      audioContextFactory: buildFactory(ctx),
      workletModuleUrl: 'https://example/worklet.js',
      clock: () => 0,
    });
    await preprocessor.attach(new MediaStream(), sessionIdentifier);
    const result = await preprocessor.detach(sessionIdentifier);
    expect(result.isOk()).toBe(true);
    expect(ctx.close).toHaveBeenCalledTimes(1);
  });

  it('detach is a no-op when session was never attached', async () => {
    const ctx = createMockContext();
    const preprocessor = createAudioPreprocessor({
      audioContextFactory: buildFactory(ctx),
      workletModuleUrl: 'https://example/worklet.js',
      clock: () => 0,
    });
    const result = await preprocessor.detach(sessionIdentifier);
    expect(result.isOk()).toBe(true);
    expect(ctx.close).not.toHaveBeenCalled();
  });
});
