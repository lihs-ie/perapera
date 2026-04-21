import { describe, expect, it, vi } from 'vitest';
import {
  createDeepgramSttProvider,
  type DeepgramRawData,
  type DeepgramSocketEvent,
  type DeepgramSocketListener,
  type DeepgramWebSocketFactory,
  type MinimalDeepgramSocket,
} from './deepgram-stt-provider';

/**
 * Deepgram adapter が要求する最小 API を満たす test fake。
 * `MinimalDeepgramSocket` を直接実装し、EventEmitter は使わず Map に直接
 * listener を保持することで型情報を失わず (cast 不要) dispatch する。
 */
type FakeSocket = MinimalDeepgramSocket & {
  emitMessage: (raw: DeepgramRawData) => void;
  emitClose: () => void;
  sendSpy: ReturnType<typeof vi.fn>;
  closeSpy: ReturnType<typeof vi.fn>;
};

const createFakeSocket = (): FakeSocket => {
  const messageListeners: ((data: DeepgramRawData) => void)[] = [];
  const closeListeners: (() => void)[] = [];
  const errorListeners: ((err: Error) => void)[] = [];

  const sendSpy = vi.fn<(data: Buffer, options: { binary: boolean }) => void>();
  const closeSpy = vi.fn<(code: number, reason: string) => void>(() => {
    setImmediate(() => {
      for (const listener of closeListeners) listener();
    });
  });

  // MinimalDeepgramSocket['on'] の listener は union 型。event に応じて
  // 適切な listener 型へ narrow する必要があるが、TypeScript の union 型は
  // 相関的 narrowing をサポートしない。ここでは runtime の event 値に
  // 紐付けて listener を dispatch するので、arg を unknown として受けて
  // 各 listener 関数へそのまま渡す (dispatch 時に型整合)。
  const on: MinimalDeepgramSocket['on'] = (
    event: DeepgramSocketEvent,
    listener: DeepgramSocketListener,
  ): unknown => {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const m = listener as (data: DeepgramRawData) => void;
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const c = listener as () => void;
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const e = listener as (err: Error) => void;
    switch (event) {
      case 'message':
        messageListeners.push(m);
        return undefined;
      case 'close':
        closeListeners.push(c);
        return undefined;
      case 'error':
        errorListeners.push(e);
        return undefined;
    }
  };
  const once: MinimalDeepgramSocket['once'] = (event, listener) => {
    if (event === 'close') {
      const wrapper = () => {
        const idx = closeListeners.indexOf(wrapper);
        if (idx >= 0) closeListeners.splice(idx, 1);
        listener();
      };
      closeListeners.push(wrapper);
    }
    return undefined;
  };

  return {
    on,
    once,
    send: sendSpy,
    close: closeSpy,
    emitMessage: (raw) => {
      for (const listener of messageListeners) listener(raw);
    },
    emitClose: () => {
      for (const listener of closeListeners) listener();
    },
    sendSpy,
    closeSpy,
  };
};

describe('createDeepgramSttProvider (IMPL-444)', () => {
  it('throws when apiKey is empty', () => {
    const factory: DeepgramWebSocketFactory = () => createFakeSocket();
    expect(() =>
      createDeepgramSttProvider({
        apiKey: '',
        webSocketFactory: factory,
      }),
    ).toThrow(/apiKey must be non-empty/);
  });

  it('opens a stream with sample_rate=16000 and Authorization header', async () => {
    const factory = vi.fn<DeepgramWebSocketFactory>(() => createFakeSocket());
    const provider = createDeepgramSttProvider({
      apiKey: 'dg-secret',
      webSocketFactory: factory,
    });
    const result = await provider.openStream({
      sourceLanguage: 'en-US',
      autoDetectLanguage: false,
    });
    expect(result.isOk()).toBe(true);
    expect(factory).toHaveBeenCalledTimes(1);
    const call = factory.mock.calls[0];
    expect(call?.[0]).toContain('sample_rate=16000');
    expect(call?.[0]).toContain('encoding=linear16');
    expect(call?.[0]).toContain('language=en-US');
    expect(call?.[1]['Authorization']).toBe('Token dg-secret');
  });

  it('emits partial event on interim results', async () => {
    const fakeSocket = createFakeSocket();
    const provider = createDeepgramSttProvider({
      apiKey: 'dg-secret',
      webSocketFactory: () => fakeSocket,
      segmentIdFactory: () => 'seg_fixed',
      clock: () => '2026-04-21T00:00:00.000Z',
    });
    const opened = await provider.openStream({
      sourceLanguage: 'en-US',
      autoDetectLanguage: false,
    });
    if (!opened.isOk()) throw new Error('stream not opened');
    const handle = opened.value;

    const iterator = handle.events[Symbol.asyncIterator]();
    const nextPromise = iterator.next();
    fakeSocket.emitMessage(
      Buffer.from(
        JSON.stringify({
          type: 'Results',
          channel: { alternatives: [{ transcript: 'hello' }] },
          is_final: false,
          start: 0,
          duration: 1,
        }),
      ),
    );
    const first = await nextPromise;
    expect(first.done).toBe(false);
    if (!first.done) {
      expect(first.value.type).toBe('partial');
      if (first.value.type === 'partial') {
        expect(first.value.text).toBe('hello');
        expect(first.value.revision).toBe(1);
        expect(first.value.segmentId).toBe('seg_fixed');
      }
    }
  });

  it('emits final event on is_final=true', async () => {
    const fakeSocket = createFakeSocket();
    const provider = createDeepgramSttProvider({
      apiKey: 'dg-secret',
      webSocketFactory: () => fakeSocket,
      segmentIdFactory: () => 'seg_fixed',
      clock: () => '2026-04-21T00:00:00.000Z',
    });
    const opened = await provider.openStream({
      sourceLanguage: 'en-US',
      autoDetectLanguage: false,
    });
    if (!opened.isOk()) throw new Error('stream not opened');
    const handle = opened.value;
    const iterator = handle.events[Symbol.asyncIterator]();
    const nextPromise = iterator.next();
    fakeSocket.emitMessage(
      Buffer.from(
        JSON.stringify({
          type: 'Results',
          channel: { alternatives: [{ transcript: 'hello world' }] },
          is_final: true,
          start: 0.1,
          duration: 1.5,
        }),
      ),
    );
    const first = await nextPromise;
    expect(first.done).toBe(false);
    if (!first.done && first.value.type === 'final') {
      expect(first.value.text).toBe('hello world');
      expect(first.value.startOffsetMs).toBe(100);
      expect(first.value.endOffsetMs).toBe(1600);
      expect(first.value.finalizedAt).toBe('2026-04-21T00:00:00.000Z');
    }
  });

  it('sendFrame base64 decodes and sends binary', async () => {
    const fakeSocket = createFakeSocket();
    const provider = createDeepgramSttProvider({
      apiKey: 'dg-secret',
      webSocketFactory: () => fakeSocket,
    });
    const opened = await provider.openStream({
      sourceLanguage: 'en-US',
      autoDetectLanguage: false,
    });
    if (!opened.isOk()) throw new Error('stream not opened');
    const handle = opened.value;
    const input = Buffer.from([1, 2, 3, 4, 5]);
    const base64 = input.toString('base64');
    const sendResult = handle.sendFrame({ audioBase64: base64, chunkId: 'chk_001' });
    expect(sendResult.isOk()).toBe(true);
    expect(fakeSocket.sendSpy).toHaveBeenCalledWith(input, { binary: true });
  });

  it('sendFrame returns error when stream is closed', async () => {
    const fakeSocket = createFakeSocket();
    const provider = createDeepgramSttProvider({
      apiKey: 'dg-secret',
      webSocketFactory: () => fakeSocket,
    });
    const opened = await provider.openStream({
      sourceLanguage: 'en-US',
      autoDetectLanguage: false,
    });
    if (!opened.isOk()) throw new Error('stream not opened');
    const handle = opened.value;
    fakeSocket.emitClose();
    await new Promise((resolve) => setImmediate(resolve));
    const result = handle.sendFrame({ audioBase64: 'AAAA=', chunkId: 'chk_001' });
    expect(result.isErr()).toBe(true);
  });

  it('uses detect_language query param when autoDetectLanguage=true', async () => {
    const factory = vi.fn<DeepgramWebSocketFactory>(() => createFakeSocket());
    const provider = createDeepgramSttProvider({
      apiKey: 'dg-secret',
      webSocketFactory: factory,
    });
    await provider.openStream({ sourceLanguage: null, autoDetectLanguage: true });
    const url = factory.mock.calls[0]?.[0] ?? '';
    expect(url).toContain('detect_language=true');
    // `language=` 単体 query (detect_language= ではない) が含まれないこと
    expect(url).not.toMatch(/(?<!detect_)language=/);
  });
});
