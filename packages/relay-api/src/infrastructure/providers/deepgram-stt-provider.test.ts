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
 *
 * `manualOpen: true` を渡すと 'open' event を自動 emit しない (open 待ち
 * テスト用)。既定では `socket.on('open', ...)` 登録時に setImmediate で
 * emit するため、provider の openStream 待機が既存テストでは透過に進む。
 */
type FakeSocket = MinimalDeepgramSocket & {
  emitMessage: (raw: DeepgramRawData) => void;
  emitOpen: () => void;
  emitClose: (code?: number, reason?: Buffer) => void;
  emitError: (err: Error) => void;
  emitUnexpectedResponse: (req: unknown, res: unknown) => void;
  sendSpy: ReturnType<typeof vi.fn>;
  closeSpy: ReturnType<typeof vi.fn>;
};

type FakeSocketOptions = Readonly<{ manualOpen?: boolean }>;

const createFakeSocket = (options: FakeSocketOptions = {}): FakeSocket => {
  const messageListeners: ((data: DeepgramRawData) => void)[] = [];
  const closeListeners: ((code: number, reason: Buffer) => void)[] = [];
  const errorListeners: ((err: Error) => void)[] = [];
  const openListeners: (() => void)[] = [];
  const unexpectedResponseListeners: ((req: unknown, res: unknown) => void)[] = [];

  const sendSpy = vi.fn<(data: Buffer, options: { binary: boolean }) => void>();
  const closeSpy = vi.fn<(code: number, reason: string) => void>(() => {
    setImmediate(() => {
      for (const listener of closeListeners) listener(1000, Buffer.from(''));
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
    const c = listener as (code: number, reason: Buffer) => void;
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const e = listener as (err: Error) => void;
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const o = listener as () => void;
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const u = listener as (req: unknown, res: unknown) => void;
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
      case 'open':
        openListeners.push(o);
        if (options.manualOpen !== true) {
          // production 互換: 'open' event は socket 作成後に非同期で発火する。
          // 既定で auto-emit して既存テストの openStream 待機を透過に進める。
          setImmediate(() => o());
        }
        return undefined;
      case 'unexpected-response':
        unexpectedResponseListeners.push(u);
        return undefined;
    }
  };
  const once: MinimalDeepgramSocket['once'] = (event, listener) => {
    if (event === 'close') {
      const wrapper = (_code: number, _reason: Buffer) => {
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
    emitOpen: () => {
      for (const listener of openListeners) listener();
    },
    emitClose: (code = 1000, reason = Buffer.from('')) => {
      for (const listener of closeListeners) listener(code, reason);
    },
    emitError: (err: Error) => {
      for (const listener of errorListeners) listener(err);
    },
    emitUnexpectedResponse: (req: unknown, res: unknown) => {
      for (const listener of unexpectedResponseListeners) listener(req, res);
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

  describe('openStream waits for WebSocket open event', () => {
    it('does not resolve until "open" event fires (manual emit)', async () => {
      const fakeSocket = createFakeSocket({ manualOpen: true });
      const provider = createDeepgramSttProvider({
        apiKey: 'dg-secret',
        webSocketFactory: () => fakeSocket,
      });
      const opening = provider.openStream({
        sourceLanguage: 'en-US',
        autoDetectLanguage: false,
      });
      // 'open' を emit するまでは pending — 非同期に決着する race を作って
      // 「先に Promise.race で sentinel が勝つ」ことで pending 状態を確認する
      const sentinel = Symbol('still-pending');
      const racedBefore = await Promise.race([
        opening.then((r) => r.isOk()),
        new Promise((resolve) => setImmediate(() => resolve(sentinel))),
      ]);
      expect(racedBefore).toBe(sentinel);

      fakeSocket.emitOpen();
      const result = await opening;
      expect(result.isOk()).toBe(true);
    });

    it('rejects with deepgram-open-rejected on unexpected-response (e.g. 401)', async () => {
      const fakeSocket = createFakeSocket({ manualOpen: true });
      const provider = createDeepgramSttProvider({
        apiKey: 'dg-secret',
        webSocketFactory: () => fakeSocket,
      });
      const opening = provider.openStream({
        sourceLanguage: 'en-US',
        autoDetectLanguage: false,
      });
      // ws の unexpected-response は (req, res) を引数に取る。res に statusCode を含む
      setImmediate(() => fakeSocket.emitUnexpectedResponse({}, { statusCode: 401 }));
      const result = await opening;
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.kind).toBe('invariant-violation');
        if (result.error.kind === 'invariant-violation') {
          expect(result.error.invariant).toBe('deepgram-open-rejected');
          expect(result.error.details).toContain('401');
        }
      }
    });

    it('rejects with deepgram-open-failed on error before open', async () => {
      const fakeSocket = createFakeSocket({ manualOpen: true });
      const provider = createDeepgramSttProvider({
        apiKey: 'dg-secret',
        webSocketFactory: () => fakeSocket,
      });
      const opening = provider.openStream({
        sourceLanguage: 'en-US',
        autoDetectLanguage: false,
      });
      setImmediate(() => fakeSocket.emitError(new Error('ECONNRESET')));
      const result = await opening;
      expect(result.isErr()).toBe(true);
      if (result.isErr() && result.error.kind === 'invariant-violation') {
        expect(result.error.invariant).toBe('deepgram-open-failed');
        expect(result.error.details).toContain('ECONNRESET');
      }
    });

    it('rejects with deepgram-open-failed when socket closes before open', async () => {
      const fakeSocket = createFakeSocket({ manualOpen: true });
      const provider = createDeepgramSttProvider({
        apiKey: 'dg-secret',
        webSocketFactory: () => fakeSocket,
      });
      const opening = provider.openStream({
        sourceLanguage: 'en-US',
        autoDetectLanguage: false,
      });
      setImmediate(() => fakeSocket.emitClose(1006, Buffer.from('')));
      const result = await opening;
      expect(result.isErr()).toBe(true);
      if (result.isErr() && result.error.kind === 'invariant-violation') {
        expect(result.error.invariant).toBe('deepgram-open-failed');
        expect(result.error.details).toContain('1006');
      }
    });

    it('rejects with deepgram-open-timeout when open never fires', async () => {
      vi.useFakeTimers();
      try {
        const fakeSocket = createFakeSocket({ manualOpen: true });
        const provider = createDeepgramSttProvider({
          apiKey: 'dg-secret',
          webSocketFactory: () => fakeSocket,
          openTimeoutMs: 100,
        });
        const opening = provider.openStream({
          sourceLanguage: 'en-US',
          autoDetectLanguage: false,
        });
        await vi.advanceTimersByTimeAsync(150);
        const result = await opening;
        expect(result.isErr()).toBe(true);
        if (result.isErr() && result.error.kind === 'invariant-violation') {
          expect(result.error.invariant).toBe('deepgram-open-timeout');
          expect(result.error.details).toContain('100ms');
        }
        // timeout 時に socket.close が呼ばれていることも確認 (resource leak 防止)
        expect(fakeSocket.closeSpy).toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('openStream URL construction (regression: HTTP 400 from invalid Deepgram params)', () => {
    const captureUrl = async (
      streamConfig: Parameters<ReturnType<typeof createDeepgramSttProvider>['openStream']>[0],
    ): Promise<URLSearchParams> => {
      const factory = vi.fn<DeepgramWebSocketFactory>(() => createFakeSocket());
      const provider = createDeepgramSttProvider({
        apiKey: 'dg-secret',
        webSocketFactory: factory,
      });
      await provider.openStream(streamConfig);
      const url = factory.mock.calls[0]?.[0] ?? '';
      const queryStart = url.indexOf('?');
      return new URLSearchParams(queryStart >= 0 ? url.slice(queryStart + 1) : '');
    };

    it('does NOT include utterance_end_ms (Deepgram requires >=1000ms; we cannot honor SttEndpointingConfig.minUtteranceMs default 500)', async () => {
      const params = await captureUrl({
        sourceLanguage: 'en-US',
        autoDetectLanguage: false,
        endpointing: {
          silenceThresholdMs: 600,
          minUtteranceMs: 500,
          punctuationAware: true,
        },
      });
      expect(params.has('utterance_end_ms')).toBe(false);
    });

    it('includes endpointing query param when SttEndpointingConfig provided', async () => {
      const params = await captureUrl({
        sourceLanguage: 'en-US',
        autoDetectLanguage: false,
        endpointing: {
          silenceThresholdMs: 600,
          minUtteranceMs: 500,
          punctuationAware: true,
        },
      });
      expect(params.get('endpointing')).toBe('600');
    });

    it('includes punctuate query param when SttEndpointingConfig provided', async () => {
      const params = await captureUrl({
        sourceLanguage: 'en-US',
        autoDetectLanguage: false,
        endpointing: {
          silenceThresholdMs: 600,
          minUtteranceMs: 500,
          punctuationAware: true,
        },
      });
      expect(params.get('punctuate')).toBe('true');
    });

    it('omits endpointing/punctuate when SttEndpointingConfig is undefined', async () => {
      const params = await captureUrl({
        sourceLanguage: 'en-US',
        autoDetectLanguage: false,
      });
      expect(params.has('endpointing')).toBe(false);
      expect(params.has('punctuate')).toBe(false);
      expect(params.has('utterance_end_ms')).toBe(false);
    });
  });
});
