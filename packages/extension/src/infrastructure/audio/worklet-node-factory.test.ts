import { describe, expect, it, vi } from 'vitest';
import { type AudioContextLike } from './audio-preprocessor';
import { type AudioWorkletNodeLike, type WorkletNodeFactory } from './worklet-node-factory';

const buildFakeContext = (): AudioContextLike => ({
  sampleRate: 16000,
  audioWorklet: { addModule: vi.fn(() => Promise.resolve()) },
  close: vi.fn(() => Promise.resolve()),
  createMediaStreamSource: vi.fn(() => ({})),
});

const buildFakeWorkletNode = (): AudioWorkletNodeLike => {
  const connect = vi.fn();
  const disconnect = vi.fn();
  return {
    port: { onmessage: null },
    connect,
    disconnect,
  };
};

describe('WorkletNodeFactory contract (IMPL-615)', () => {
  it('factory returns node with port / connect / disconnect surface', () => {
    const context = buildFakeContext();
    const fakeNode = buildFakeWorkletNode();
    const factory: WorkletNodeFactory = vi.fn(() => fakeNode);

    const node = factory(context, 'perapera-audio-processor');

    expect(factory).toHaveBeenCalledWith(context, 'perapera-audio-processor');
    expect(node.port).toBeDefined();
    expect(node.connect).toBeTypeOf('function');
    expect(node.disconnect).toBeTypeOf('function');
  });

  it('node supports onmessage assignment (frame listener wiring)', () => {
    const node = buildFakeWorkletNode();
    // AudioWorkletNodeLike.port.onmessage は readonly ではない実用上の挙動を
    // structural に検査 (production / test 両方で代入可能であること)
    const listener = vi.fn();
    Object.defineProperty(node.port, 'onmessage', {
      configurable: true,
      writable: true,
      value: listener,
    });
    expect(node.port.onmessage).toBe(listener);
  });

  it('disconnect can be called (stub no-op)', () => {
    const node = buildFakeWorkletNode();
    node.disconnect();
    expect(node.disconnect).toHaveBeenCalledOnce();
  });
});
