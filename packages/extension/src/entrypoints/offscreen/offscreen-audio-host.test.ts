import { describe, expect, it, vi } from 'vitest';
import {
  type AudioContextLike,
  type AudioContextFactory,
} from '../../infrastructure/audio/audio-preprocessor';
import {
  parseSessionIdentifier,
  type SessionIdentifier,
} from '../../domain/session/session-identifier';
import { createOffscreenAudioHost } from './offscreen-audio-host';

const SESSION_A = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const SESSION_B = '01HZX8Y1R8M7D3Q2P4T5V6W7A2';
const identifierA: SessionIdentifier = parseSessionIdentifier(SESSION_A)._unsafeUnwrap();
const identifierB: SessionIdentifier = parseSessionIdentifier(SESSION_B)._unsafeUnwrap();

const buildFakeContext = (
  sampleRate: number,
): AudioContextLike & { closeFn: ReturnType<typeof vi.fn> } => {
  const closeFn = vi.fn(() => Promise.resolve());
  return {
    sampleRate,
    audioWorklet: { addModule: vi.fn(() => Promise.resolve()) },
    close: closeFn,
    createMediaStreamSource: vi.fn(() => ({})),
    closeFn,
  };
};

const buildLogger = () => ({
  debug: vi.fn<(message: string) => void>(),
  warn: vi.fn<(message: string) => void>(),
});

describe('createOffscreenAudioHost (IMPL-561)', () => {
  it('opens an AudioContext on offscreen.audio.open', () => {
    const context = buildFakeContext(16000);
    const factory: AudioContextFactory = vi.fn(() => context);
    const host = createOffscreenAudioHost({ audioContextFactory: factory });
    host.dispatch({ type: 'offscreen.audio.open', sessionIdentifier: identifierA });
    expect(factory).toHaveBeenCalledOnce();
    expect(host.has(identifierA)).toBe(true);
  });

  it('uses sampleRateHz override when provided', () => {
    const factory = vi.fn<AudioContextFactory>(() => buildFakeContext(48000));
    const host = createOffscreenAudioHost({ audioContextFactory: factory });
    host.dispatch({
      type: 'offscreen.audio.open',
      sessionIdentifier: identifierA,
      sampleRateHz: 48000,
    });
    expect(factory).toHaveBeenCalledWith({ sampleRate: 48000 });
  });

  it('defaults sampleRate to 16000 when not provided', () => {
    const factory = vi.fn<AudioContextFactory>(() => buildFakeContext(16000));
    const host = createOffscreenAudioHost({ audioContextFactory: factory });
    host.dispatch({ type: 'offscreen.audio.open', sessionIdentifier: identifierA });
    expect(factory).toHaveBeenCalledWith({ sampleRate: 16000 });
  });

  it('reuses existing AudioContext on duplicate open', () => {
    const factory = vi.fn<AudioContextFactory>(() => buildFakeContext(16000));
    const host = createOffscreenAudioHost({ audioContextFactory: factory });
    host.dispatch({ type: 'offscreen.audio.open', sessionIdentifier: identifierA });
    host.dispatch({ type: 'offscreen.audio.open', sessionIdentifier: identifierA });
    expect(factory).toHaveBeenCalledOnce();
  });

  it('closes AudioContext on offscreen.audio.close', () => {
    const context = buildFakeContext(16000);
    const factory = vi.fn<AudioContextFactory>(() => context);
    const host = createOffscreenAudioHost({ audioContextFactory: factory });
    host.dispatch({ type: 'offscreen.audio.open', sessionIdentifier: identifierA });
    host.dispatch({ type: 'offscreen.audio.close', sessionIdentifier: identifierA });
    expect(context.closeFn).toHaveBeenCalledOnce();
    expect(host.has(identifierA)).toBe(false);
  });

  it('is a no-op when close is received for unknown session', () => {
    const factory = vi.fn<AudioContextFactory>(() => buildFakeContext(16000));
    const host = createOffscreenAudioHost({ audioContextFactory: factory });
    host.dispatch({ type: 'offscreen.audio.close', sessionIdentifier: identifierA });
    expect(factory).not.toHaveBeenCalled();
  });

  it('handles multiple sessions independently', () => {
    const factory = vi.fn<AudioContextFactory>(() => buildFakeContext(16000));
    const host = createOffscreenAudioHost({ audioContextFactory: factory });
    host.dispatch({ type: 'offscreen.audio.open', sessionIdentifier: identifierA });
    host.dispatch({ type: 'offscreen.audio.open', sessionIdentifier: identifierB });
    expect(host.has(identifierA)).toBe(true);
    expect(host.has(identifierB)).toBe(true);
    host.dispatch({ type: 'offscreen.audio.close', sessionIdentifier: identifierA });
    expect(host.has(identifierA)).toBe(false);
    expect(host.has(identifierB)).toBe(true);
  });

  it('ping is acknowledged (debug log) without side effect', () => {
    const logger = buildLogger();
    const factory = vi.fn<AudioContextFactory>(() => buildFakeContext(16000));
    const host = createOffscreenAudioHost({ audioContextFactory: factory, logger });
    host.dispatch({ type: 'offscreen.ping' });
    expect(factory).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('received ping'));
  });

  it('logs warn when audioContextFactory throws', () => {
    const logger = buildLogger();
    const factory = vi.fn<AudioContextFactory>(() => {
      throw new Error('AudioContext unavailable');
    });
    const host = createOffscreenAudioHost({ audioContextFactory: factory, logger });
    host.dispatch({ type: 'offscreen.audio.open', sessionIdentifier: identifierA });
    expect(host.has(identifierA)).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('AudioContext unavailable'));
  });

  it('dispose closes all active contexts', () => {
    const contextA = buildFakeContext(16000);
    const contextB = buildFakeContext(16000);
    let call = 0;
    const factory: AudioContextFactory = vi.fn(() => {
      call += 1;
      return call === 1 ? contextA : contextB;
    });
    const host = createOffscreenAudioHost({ audioContextFactory: factory });
    host.dispatch({ type: 'offscreen.audio.open', sessionIdentifier: identifierA });
    host.dispatch({ type: 'offscreen.audio.open', sessionIdentifier: identifierB });
    host.dispose();
    expect(contextA.closeFn).toHaveBeenCalledOnce();
    expect(contextB.closeFn).toHaveBeenCalledOnce();
  });
});
