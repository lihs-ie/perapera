import { errAsync, okAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import { type AudioFrameChannel, type AudioFrameEnvelope } from '../ports/audio-preprocessor';
import {
  parseSessionIdentifier,
  type SessionIdentifier,
} from '../../domain/session/session-identifier';
import { invariantViolationError, type DomainError } from '../../domain/shared/errors';
import { createAudioFramePump, type SendAudioFrame } from './audio-frame-pump';

const SESSION_A = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const SESSION_B = '01HZX8Y1R8M7D3Q2P4T5V6W7A2';
const identifierA: SessionIdentifier = parseSessionIdentifier(SESSION_A)._unsafeUnwrap();
const identifierB: SessionIdentifier = parseSessionIdentifier(SESSION_B)._unsafeUnwrap();

const buildFrame = (
  sessionIdentifier: SessionIdentifier,
  sequenceNumber: number,
): AudioFrameEnvelope => ({
  sessionIdentifier,
  sequenceNumber,
  sampleRate: 16000,
  channels: 1,
  pcm16Base64: `base64:${sequenceNumber.toString()}`,
  capturedAt: `2026-04-22T00:00:00.${sequenceNumber.toString().padStart(3, '0')}Z`,
  durationMs: 100,
});

/**
 * 制御可能な AsyncIterable を提供する helper。
 * - `push(frame)` で 1 フレーム yield
 * - `end()` で iterator を自然終了
 * - `close` は AudioFrameChannel の close port (vi.fn でスパイ)
 */
const buildControllableChannel = (): {
  channel: AudioFrameChannel;
  push: (frame: AudioFrameEnvelope) => void;
  end: () => void;
  close: ReturnType<typeof vi.fn>;
} => {
  const queue: AudioFrameEnvelope[] = [];
  const waiters: ((value: IteratorResult<AudioFrameEnvelope>) => void)[] = [];
  let ended = false;

  const push = (frame: AudioFrameEnvelope): void => {
    const waiter = waiters.shift();
    if (waiter !== undefined) {
      waiter({ done: false, value: frame });
      return;
    }
    queue.push(frame);
  };

  const end = (): void => {
    ended = true;
    while (waiters.length > 0) {
      const waiter = waiters.shift();
      waiter?.({ done: true, value: undefined });
    }
  };

  const asyncIterator: AsyncIterator<AudioFrameEnvelope> = {
    next: (): Promise<IteratorResult<AudioFrameEnvelope>> => {
      const head = queue.shift();
      if (head !== undefined) {
        return Promise.resolve<IteratorResult<AudioFrameEnvelope>>({
          done: false,
          value: head,
        });
      }
      if (ended) {
        return Promise.resolve<IteratorResult<AudioFrameEnvelope>>({
          done: true,
          value: undefined,
        });
      }
      return new Promise((resolve) => {
        waiters.push(resolve);
      });
    },
  };

  const close = vi.fn();
  const channel: AudioFrameChannel = {
    frames: {
      [Symbol.asyncIterator]: () => asyncIterator,
    },
    close,
  };

  return { channel, push, end, close };
};

/** Promise microtask を flush するだけのユーティリティ。pump iterate を 1 周進める用途。 */
const flush = async (): Promise<void> => {
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
};

describe('createAudioFramePump (IMPL-602)', () => {
  it('drains frames from the channel into sendFrame in order', async () => {
    const { channel, push, end } = buildControllableChannel();
    const sent: AudioFrameEnvelope[] = [];
    const sendFrame: SendAudioFrame = vi.fn((frame: AudioFrameEnvelope) => {
      sent.push(frame);
      return okAsync<void, DomainError>(undefined);
    });
    const pump = createAudioFramePump();
    pump.start(identifierA, channel, sendFrame);

    push(buildFrame(identifierA, 1));
    push(buildFrame(identifierA, 2));
    push(buildFrame(identifierA, 3));
    end();

    await flush();
    await flush();
    await flush();

    expect(sendFrame).toHaveBeenCalledTimes(3);
    expect(sent.map((f) => f.sequenceNumber)).toEqual([1, 2, 3]);
    expect(pump.activeCount()).toBe(0);
  });

  it('stop aborts the drain loop before the next frame is sent', async () => {
    const { channel, push } = buildControllableChannel();
    const sendFrame: SendAudioFrame = vi.fn(() => okAsync<void, DomainError>(undefined));
    const pump = createAudioFramePump();
    pump.start(identifierA, channel, sendFrame);

    push(buildFrame(identifierA, 1));
    await flush();
    expect(sendFrame).toHaveBeenCalledTimes(1);

    pump.stop(identifierA);
    push(buildFrame(identifierA, 2));
    await flush();

    expect(sendFrame).toHaveBeenCalledTimes(1);
    expect(pump.activeCount()).toBe(0);
  });

  it('logs warn when sendFrame returns Err and continues with the next frame', async () => {
    const logWarn = vi.fn();
    const { channel, push, end } = buildControllableChannel();
    const calls: number[] = [];
    const sendFrame: SendAudioFrame = vi.fn((frame: AudioFrameEnvelope) => {
      calls.push(frame.sequenceNumber);
      if (frame.sequenceNumber === 1) {
        return errAsync<void, DomainError>(
          invariantViolationError({ invariant: 'test', details: 'boom' }),
        );
      }
      return okAsync<void, DomainError>(undefined);
    });
    const pump = createAudioFramePump({ logWarn });
    pump.start(identifierA, channel, sendFrame);

    push(buildFrame(identifierA, 1));
    push(buildFrame(identifierA, 2));
    end();
    await flush();
    await flush();
    await flush();

    expect(calls).toEqual([1, 2]);
    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('boom'));
  });

  it('start twice for same session aborts the existing drain (idempotent)', async () => {
    const first = buildControllableChannel();
    const second = buildControllableChannel();
    const observedSequences: number[] = [];
    const sendFrame: SendAudioFrame = vi.fn((frame: AudioFrameEnvelope) => {
      observedSequences.push(frame.sequenceNumber);
      return okAsync<void, DomainError>(undefined);
    });
    const pump = createAudioFramePump();

    pump.start(identifierA, first.channel, sendFrame);
    first.push(buildFrame(identifierA, 1));
    await flush();
    expect(sendFrame).toHaveBeenCalledTimes(1);

    pump.start(identifierA, second.channel, sendFrame);
    first.push(buildFrame(identifierA, 2));
    second.push(buildFrame(identifierA, 99));
    await flush();
    await flush();

    expect(observedSequences).toContain(99);
    expect(observedSequences).not.toContain(2);
    expect(pump.activeCount()).toBe(1);
  });

  it('stopAll aborts every active drain', async () => {
    const a = buildControllableChannel();
    const b = buildControllableChannel();
    const sendFrame: SendAudioFrame = vi.fn(() => okAsync<void, DomainError>(undefined));
    const pump = createAudioFramePump();
    pump.start(identifierA, a.channel, sendFrame);
    pump.start(identifierB, b.channel, sendFrame);
    expect(pump.activeCount()).toBe(2);

    pump.stopAll();
    a.push(buildFrame(identifierA, 1));
    b.push(buildFrame(identifierB, 1));
    await flush();

    expect(sendFrame).not.toHaveBeenCalled();
    expect(pump.activeCount()).toBe(0);
  });

  it('stop for unregistered session is a no-op', () => {
    const pump = createAudioFramePump();
    expect(() => {
      pump.stop(identifierA);
    }).not.toThrow();
    expect(pump.activeCount()).toBe(0);
  });

  it('removes the session from active map when iterator ends naturally', async () => {
    const { channel, end } = buildControllableChannel();
    const sendFrame: SendAudioFrame = vi.fn(() => okAsync<void, DomainError>(undefined));
    const pump = createAudioFramePump();
    pump.start(identifierA, channel, sendFrame);
    expect(pump.activeCount()).toBe(1);

    end();
    await flush();
    await flush();

    expect(pump.activeCount()).toBe(0);
  });

  it('logs warn when the iterator itself throws (not via AbortSignal)', async () => {
    const logWarn = vi.fn();
    const brokenChannel: AudioFrameChannel = {
      frames: {
        [Symbol.asyncIterator]: () => ({
          next: (): Promise<IteratorResult<AudioFrameEnvelope>> =>
            Promise.reject(new Error('iterator exploded')),
        }),
      },
      close: vi.fn(),
    };
    const sendFrame: SendAudioFrame = vi.fn(() => okAsync<void, DomainError>(undefined));
    const pump = createAudioFramePump({ logWarn });
    pump.start(identifierA, brokenChannel, sendFrame);

    await flush();
    await flush();

    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('iterator exploded'));
    expect(sendFrame).not.toHaveBeenCalled();
    expect(pump.activeCount()).toBe(0);
  });

  it('does not call frameChannel.close (leaves channel lifecycle to CaptureOrchestrator)', async () => {
    const { channel, close } = buildControllableChannel();
    const sendFrame: SendAudioFrame = vi.fn(() => okAsync<void, DomainError>(undefined));
    const pump = createAudioFramePump();
    pump.start(identifierA, channel, sendFrame);
    await flush();
    pump.stop(identifierA);
    await flush();

    expect(close).not.toHaveBeenCalled();
  });
});
