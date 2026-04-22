import { errAsync, okAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import {
  type AudioContextLike,
  type AudioContextFactory,
} from '../../infrastructure/audio/audio-preprocessor';
import { type TabStreamApi } from '../../infrastructure/audio/tab-stream-api';
import { type AudioWorkletNodeLike } from '../../infrastructure/audio/worklet-node-factory';
import { invariantViolationError, type DomainError } from '../../domain/shared/errors';
import {
  parseSessionIdentifier,
  type SessionIdentifier,
} from '../../domain/session/session-identifier';
import { addFakeTrack } from '../../../tests/helpers/media-stream';
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

  // IMPL-612: tabStreamId 付き audio.open で MediaStream を取得・保持・破棄
  it('acquires MediaStream when tabStreamId is provided and tabStreamApi is injected', async () => {
    const factory = vi.fn<AudioContextFactory>(() => buildFakeContext(16000));
    const mediaStream = new MediaStream();
    const acquire = vi.fn<TabStreamApi['acquire']>(() =>
      okAsync<MediaStream, DomainError>(mediaStream),
    );
    const host = createOffscreenAudioHost({
      audioContextFactory: factory,
      tabStreamApi: { acquire },
    });

    host.dispatch({
      type: 'offscreen.audio.open',
      sessionIdentifier: identifierA,
      tabStreamId: 'tab-stream-id-fixture',
    });
    await new Promise((resolve) => {
      setImmediate(resolve);
    });

    expect(acquire).toHaveBeenCalledWith('tab-stream-id-fixture');
    expect(host.has(identifierA)).toBe(true);
    expect(host.hasStream(identifierA)).toBe(true);
  });

  it('stops MediaStream tracks when session closes (IMPL-612)', async () => {
    const factory = vi.fn<AudioContextFactory>(() => buildFakeContext(16000));
    const mediaStream = new MediaStream();
    const stop = vi.fn();
    addFakeTrack(mediaStream, { stop });
    const acquire = vi.fn<TabStreamApi['acquire']>(() =>
      okAsync<MediaStream, DomainError>(mediaStream),
    );
    const host = createOffscreenAudioHost({
      audioContextFactory: factory,
      tabStreamApi: { acquire },
    });

    host.dispatch({
      type: 'offscreen.audio.open',
      sessionIdentifier: identifierA,
      tabStreamId: 'tab-stream-id-fixture',
    });
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
    host.dispatch({ type: 'offscreen.audio.close', sessionIdentifier: identifierA });

    expect(stop).toHaveBeenCalledTimes(1);
    expect(host.hasStream(identifierA)).toBe(false);
  });

  it('logs warn and keeps AudioContext open when tab-stream acquire fails', async () => {
    const logger = buildLogger();
    const factory = vi.fn<AudioContextFactory>(() => buildFakeContext(16000));
    const acquire = vi.fn<TabStreamApi['acquire']>(() =>
      errAsync<MediaStream, DomainError>(
        invariantViolationError({ invariant: 'tab-stream-api', details: 'permission denied' }),
      ),
    );
    const host = createOffscreenAudioHost({
      audioContextFactory: factory,
      tabStreamApi: { acquire },
      logger,
    });

    host.dispatch({
      type: 'offscreen.audio.open',
      sessionIdentifier: identifierA,
      tabStreamId: 'tab-stream-id-fixture',
    });
    await new Promise((resolve) => {
      setImmediate(resolve);
    });

    expect(host.has(identifierA)).toBe(true);
    expect(host.hasStream(identifierA)).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('permission denied'));
  });

  it('ignores tabStreamId when tabStreamApi is not injected (backward-compatible)', () => {
    const logger = buildLogger();
    const factory = vi.fn<AudioContextFactory>(() => buildFakeContext(16000));
    const host = createOffscreenAudioHost({ audioContextFactory: factory, logger });

    host.dispatch({
      type: 'offscreen.audio.open',
      sessionIdentifier: identifierA,
      tabStreamId: 'tab-stream-id-fixture',
    });

    expect(host.has(identifierA)).toBe(true);
    expect(host.hasStream(identifierA)).toBe(false);
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('tabStreamApi not injected'));
  });

  // IMPL-614: workletModuleUrl が注入されると addModule を呼ぶ
  it('calls audioWorklet.addModule when workletModuleUrl is provided', async () => {
    const addModule = vi.fn(() => Promise.resolve());
    const context: AudioContextLike & { closeFn: ReturnType<typeof vi.fn> } = {
      sampleRate: 16000,
      audioWorklet: { addModule },
      close: vi.fn(() => Promise.resolve()),
      createMediaStreamSource: vi.fn(() => ({})),
      closeFn: vi.fn(),
    };
    const factory = vi.fn<AudioContextFactory>(() => context);
    const host = createOffscreenAudioHost({
      audioContextFactory: factory,
      workletModuleUrl: 'chrome-extension://xxx/perapera-audio-processor.js',
    });

    host.dispatch({ type: 'offscreen.audio.open', sessionIdentifier: identifierA });
    await new Promise((resolve) => {
      setImmediate(resolve);
    });

    expect(addModule).toHaveBeenCalledWith('chrome-extension://xxx/perapera-audio-processor.js');
  });

  it('logs warn when audioWorklet.addModule rejects', async () => {
    const logger = buildLogger();
    const addModule = vi.fn(() => Promise.reject(new Error('worklet load failed')));
    const context: AudioContextLike & { closeFn: ReturnType<typeof vi.fn> } = {
      sampleRate: 16000,
      audioWorklet: { addModule },
      close: vi.fn(() => Promise.resolve()),
      createMediaStreamSource: vi.fn(() => ({})),
      closeFn: vi.fn(),
    };
    const factory = vi.fn<AudioContextFactory>(() => context);
    const host = createOffscreenAudioHost({
      audioContextFactory: factory,
      workletModuleUrl: '/perapera-audio-processor.js',
      logger,
    });

    host.dispatch({ type: 'offscreen.audio.open', sessionIdentifier: identifierA });
    await new Promise((resolve) => {
      setImmediate(resolve);
    });

    expect(host.has(identifierA)).toBe(true); // context は保持される
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('worklet load failed'));
  });

  it('skips addModule when workletModuleUrl is not provided (backward-compatible)', () => {
    const addModule = vi.fn(() => Promise.resolve());
    const context: AudioContextLike & { closeFn: ReturnType<typeof vi.fn> } = {
      sampleRate: 16000,
      audioWorklet: { addModule },
      close: vi.fn(() => Promise.resolve()),
      createMediaStreamSource: vi.fn(() => ({
        connect: vi.fn(),
        disconnect: vi.fn(),
      })),
      closeFn: vi.fn(),
    };
    const factory = vi.fn<AudioContextFactory>(() => context);
    const host = createOffscreenAudioHost({ audioContextFactory: factory });

    host.dispatch({ type: 'offscreen.audio.open', sessionIdentifier: identifierA });

    expect(addModule).not.toHaveBeenCalled();
  });

  // IMPL-616: MediaStream + WorkletNode 接続
  it('connects MediaStreamAudioSourceNode → AudioWorkletNode when all deps injected', async () => {
    const sourceNode = { connect: vi.fn(), disconnect: vi.fn() };
    const workletNode: AudioWorkletNodeLike = {
      port: { onmessage: null },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    const createMediaStreamSource = vi.fn(() => sourceNode);
    const context = {
      sampleRate: 16000,
      audioWorklet: { addModule: vi.fn(() => Promise.resolve()) },
      close: vi.fn(() => Promise.resolve()),
      createMediaStreamSource,
    };
    const factory = vi.fn<AudioContextFactory>(() => context);
    const mediaStream = new MediaStream();
    const workletNodeFactory = vi.fn(() => workletNode);

    const host = createOffscreenAudioHost({
      audioContextFactory: factory,
      workletModuleUrl: '/perapera-audio-processor.js',
      tabStreamApi: { acquire: vi.fn(() => okAsync<MediaStream, DomainError>(mediaStream)) },
      workletNodeFactory,
    });

    host.dispatch({
      type: 'offscreen.audio.open',
      sessionIdentifier: identifierA,
      tabStreamId: 'tab-stream-id-fixture',
    });
    // addModule + acquire 両方の microtask を flush
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
    await new Promise((resolve) => {
      setImmediate(resolve);
    });

    expect(createMediaStreamSource).toHaveBeenCalledWith(mediaStream);
    expect(workletNodeFactory).toHaveBeenCalledWith(context, 'perapera-audio-processor');
    expect(sourceNode.connect).toHaveBeenCalledWith(workletNode);
    expect(host.hasWorkletConnected(identifierA)).toBe(true);
  });

  it('disconnects source / worklet on close (IMPL-616)', async () => {
    const sourceNode = { connect: vi.fn(), disconnect: vi.fn() };
    const workletNode: AudioWorkletNodeLike = {
      port: { onmessage: null },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    const context = {
      sampleRate: 16000,
      audioWorklet: { addModule: vi.fn(() => Promise.resolve()) },
      close: vi.fn(() => Promise.resolve()),
      createMediaStreamSource: vi.fn(() => sourceNode),
    };
    const factory = vi.fn<AudioContextFactory>(() => context);
    const mediaStream = new MediaStream();
    const host = createOffscreenAudioHost({
      audioContextFactory: factory,
      workletModuleUrl: '/perapera-audio-processor.js',
      tabStreamApi: { acquire: vi.fn(() => okAsync<MediaStream, DomainError>(mediaStream)) },
      workletNodeFactory: vi.fn(() => workletNode),
    });

    host.dispatch({
      type: 'offscreen.audio.open',
      sessionIdentifier: identifierA,
      tabStreamId: 'tab-stream-id-fixture',
    });
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
    host.dispatch({ type: 'offscreen.audio.close', sessionIdentifier: identifierA });

    expect(sourceNode.disconnect).toHaveBeenCalledOnce();
    expect(workletNode.disconnect).toHaveBeenCalledOnce();
  });

  // IMPL-617: worklet port.onmessage で frame を受け、onAudioFrame callback へ転送
  it('forwards AudioWorkletNode port.onmessage payload via onAudioFrame (IMPL-617)', async () => {
    const workletNode: AudioWorkletNodeLike = {
      port: { onmessage: null },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    const sourceNode = { connect: vi.fn(), disconnect: vi.fn() };
    const context = {
      sampleRate: 16000,
      audioWorklet: { addModule: vi.fn(() => Promise.resolve()) },
      close: vi.fn(() => Promise.resolve()),
      createMediaStreamSource: vi.fn(() => sourceNode),
    };
    const factory = vi.fn<AudioContextFactory>(() => context);
    const mediaStream = new MediaStream();
    const onAudioFrame = vi.fn();

    const host = createOffscreenAudioHost({
      audioContextFactory: factory,
      workletModuleUrl: '/perapera-audio-processor.js',
      tabStreamApi: { acquire: vi.fn(() => okAsync<MediaStream, DomainError>(mediaStream)) },
      workletNodeFactory: vi.fn(() => workletNode),
      onAudioFrame,
    });

    host.dispatch({
      type: 'offscreen.audio.open',
      sessionIdentifier: identifierA,
      tabStreamId: 'tab-stream-id-fixture',
    });
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
    await new Promise((resolve) => {
      setImmediate(resolve);
    });

    expect(typeof workletNode.port.onmessage).toBe('function');
    // worklet processor が postMessage した想定のイベントを直接発火
    const framePayload = {
      type: 'audio.frame',
      sequenceNumber: 1,
      sampleRate: 16000,
      channels: 1,
      durationMs: 100,
      capturedAt: '2026-04-22T00:00:00.000Z',
      pcm16Base64: 'AAAA',
    };
    // MessageEvent 型の厳密な constructor は jsdom で利用可能
    workletNode.port.onmessage?.(new MessageEvent('message', { data: framePayload }));

    expect(onAudioFrame).toHaveBeenCalledWith(identifierA, framePayload);
  });

  it('catches onAudioFrame callback throw without detaching the listener (IMPL-617)', async () => {
    const logger = buildLogger();
    const workletNode: AudioWorkletNodeLike = {
      port: { onmessage: null },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    const sourceNode = { connect: vi.fn(), disconnect: vi.fn() };
    const context = {
      sampleRate: 16000,
      audioWorklet: { addModule: vi.fn(() => Promise.resolve()) },
      close: vi.fn(() => Promise.resolve()),
      createMediaStreamSource: vi.fn(() => sourceNode),
    };
    const factory = vi.fn<AudioContextFactory>(() => context);
    const mediaStream = new MediaStream();
    const onAudioFrame = vi.fn(() => {
      throw new Error('boom');
    });

    const host = createOffscreenAudioHost({
      audioContextFactory: factory,
      workletModuleUrl: '/perapera-audio-processor.js',
      tabStreamApi: { acquire: vi.fn(() => okAsync<MediaStream, DomainError>(mediaStream)) },
      workletNodeFactory: vi.fn(() => workletNode),
      onAudioFrame,
      logger,
    });

    host.dispatch({
      type: 'offscreen.audio.open',
      sessionIdentifier: identifierA,
      tabStreamId: 'tab-stream-id-fixture',
    });
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
    await new Promise((resolve) => {
      setImmediate(resolve);
    });

    workletNode.port.onmessage?.(new MessageEvent('message', { data: { type: 'audio.frame' } }));
    workletNode.port.onmessage?.(new MessageEvent('message', { data: { type: 'audio.frame' } }));

    // 2 回呼ばれている (1 回目で throw しても listener は外れない)
    expect(onAudioFrame).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('boom'));
  });
});
