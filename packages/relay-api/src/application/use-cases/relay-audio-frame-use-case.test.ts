import { err, ok, okAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import { invariantViolationError, type DomainError } from '../../domain/shared/errors';
import { type SttStreamHandle } from '../ports/stt-port';
import { createRelayAudioFrameUseCase } from './relay-audio-frame-use-case';

const buildHandle = (): SttStreamHandle & {
  sendFrame: ReturnType<typeof vi.fn>;
} => ({
  sendFrame: vi.fn(() => ok(undefined)),
  close: () => okAsync<void, DomainError>(undefined),
  events: {
    [Symbol.asyncIterator]: () => ({
      next: () => Promise.resolve({ done: true as const, value: undefined }),
    }),
  },
});

describe('createRelayAudioFrameUseCase (IMPL-402)', () => {
  it('forwards audio.frame payload to SttStreamHandle.sendFrame', () => {
    const handle = buildHandle();
    const useCase = createRelayAudioFrameUseCase();
    const result = useCase(handle, { audioBase64: 'AAAA=', chunkId: 'chk_001' });
    expect(result.isOk()).toBe(true);
    expect(handle.sendFrame).toHaveBeenCalledWith({
      audioBase64: 'AAAA=',
      chunkId: 'chk_001',
    });
  });

  it('propagates sendFrame error', () => {
    const failingHandle: SttStreamHandle = {
      sendFrame: () =>
        err(invariantViolationError({ invariant: 'stt-send-failed', details: 'closed' })),
      close: () => okAsync<void, DomainError>(undefined),
      events: {
        [Symbol.asyncIterator]: () => ({
          next: () => Promise.resolve({ done: true as const, value: undefined }),
        }),
      },
    };
    const useCase = createRelayAudioFrameUseCase();
    const result = useCase(failingHandle, { audioBase64: 'AAAA=', chunkId: 'chk_001' });
    expect(result.isErr()).toBe(true);
  });
});
