import { errAsync, okAsync } from 'neverthrow';
import { invariantViolationError } from '../../domain/shared/errors';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLanguagePair } from '../../domain/session/language-pair';
import { createSourceSession, type SourceSession } from '../../domain/session/source-session';
import { parseSessionIdentifier } from '../../domain/session/session-identifier';
import { type RelayEvent } from '../../application/ports/relay-gateway';
import {
  createRelayWebSocketGateway,
  type RelayWebSocketGatewayDependencies,
} from './relay-websocket-gateway';
import type { WebSocketLike } from './websocket-factory';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const SOURCE_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7B1';
const SERVER_SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7C2';
const STREAM_TOKEN = 'stream-token-xxx';
const RELAY_URL = 'wss://relay.example/relay';

const sessionIdentifier = parseSessionIdentifier(SESSION_ID)._unsafeUnwrap();

const buildSession = (): SourceSession =>
  createSourceSession({
    sessionIdentifier: SESSION_ID,
    sourceIdentifier: SOURCE_ID,
    sourceType: 'tab',
    languagePair: createLanguagePair({ source: 'en-US', target: 'ja-JP' })._unsafeUnwrap(),
    startedAt: '2026-04-21T00:00:00.000Z',
  })._unsafeUnwrap();

type MockSocket = WebSocketLike & {
  sentMessages: string[];
  simulateOpen: () => void;
  simulateMessage: (data: string) => void;
  simulateClose: () => void;
  listenerCount: (type: string) => number;
  isClosed: boolean;
};

const createMockSocket = (): MockSocket => {
  const listeners = new Map<string, Set<(event: Event) => void>>();
  const sentMessages: string[] = [];
  let readyState = 0; // CONNECTING
  let closed = false;
  return {
    get readyState() {
      return readyState;
    },
    send: (data) => {
      sentMessages.push(data);
    },
    close: () => {
      readyState = 3;
      closed = true;
      const closeListeners = listeners.get('close');
      if (closeListeners !== undefined) {
        for (const listener of closeListeners) listener(new Event('close'));
      }
    },
    addEventListener: (type, listener) => {
      let set = listeners.get(type);
      if (set === undefined) {
        set = new Set();
        listeners.set(type, set);
      }
      set.add(listener);
    },
    removeEventListener: (type, listener) => {
      listeners.get(type)?.delete(listener);
    },
    sentMessages,
    simulateOpen: () => {
      readyState = 1;
      const openListeners = listeners.get('open');
      if (openListeners !== undefined) {
        for (const listener of openListeners) listener(new Event('open'));
      }
    },
    simulateMessage: (data) => {
      const messageListeners = listeners.get('message');
      if (messageListeners !== undefined) {
        const event = new MessageEvent('message', { data });
        for (const listener of messageListeners) listener(event);
      }
    },
    simulateClose: () => {
      readyState = 3;
      closed = true;
      const closeListeners = listeners.get('close');
      if (closeListeners !== undefined) {
        for (const listener of closeListeners) listener(new Event('close'));
      }
    },
    listenerCount: (type) => listeners.get(type)?.size ?? 0,
    get isClosed() {
      return closed;
    },
  };
};

const flushUntilSocketCreated = async (sockets: MockSocket[]): Promise<void> => {
  for (let i = 0; i < 50 && sockets.length === 0; i += 1) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  }
};

const buildDependencies = (
  overrides: Partial<RelayWebSocketGatewayDependencies> = {},
): RelayWebSocketGatewayDependencies & {
  createdSockets: MockSocket[];
  createdUrls: string[];
} => {
  const createdSockets: MockSocket[] = [];
  const createdUrls: string[] = [];
  const webSocketFactory = vi.fn((url: string) => {
    createdUrls.push(url);
    const socket = createMockSocket();
    createdSockets.push(socket);
    return socket;
  });
  const tokenIssuer = vi.fn(() =>
    okAsync({ streamToken: STREAM_TOKEN, relayUrl: RELAY_URL, sessionId: SERVER_SESSION_ID }),
  );
  const clock = vi.fn(() => Date.parse('2026-04-21T00:00:00.000Z'));

  return Object.assign(
    {
      webSocketFactory,
      tokenIssuer,
      clock,
      protocolVersion: '1.0',
      ...overrides,
    },
    { createdSockets, createdUrls },
  );
};

describe('createRelayWebSocketGateway (IMPL-320, DD-105 / DD-411)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {
      /* silence */
    });
  });

  describe('openSession', () => {
    it('uses the Relay-issued sessionId (not extension local id) in the WS URL', async () => {
      const deps = buildDependencies();
      const gateway = createRelayWebSocketGateway(deps);
      const resultPromise = gateway.openSession(buildSession());
      await flushUntilSocketCreated(deps.createdSockets);
      deps.createdSockets[0]?.simulateOpen();
      const result = await resultPromise;
      expect(result.isOk()).toBe(true);
      const urlArg = deps.createdUrls[0] ?? '';
      expect(urlArg).toContain(RELAY_URL);
      expect(urlArg).toContain(`token=${STREAM_TOKEN}`);
      // sessionId in URL must match token.sub (Relay-issued), not extension local id
      expect(urlArg).toContain(`sessionId=${SERVER_SESSION_ID}`);
      expect(urlArg).not.toContain(`sessionId=${SESSION_ID}`);
      expect(urlArg).toContain('protocolVersion=1.0');
    });

    it('supports a custom wsEndpointBuilder override', async () => {
      const customBuilder = vi.fn(
        (params: {
          relayUrl: string;
          serverSessionId: string;
          streamToken: string;
          protocolVersion: string;
        }) =>
          `${params.relayUrl}/custom?t=${params.streamToken}&s=${params.serverSessionId}&v=${params.protocolVersion}`,
      );
      const deps = buildDependencies({ wsEndpointBuilder: customBuilder });
      const gateway = createRelayWebSocketGateway(deps);
      const resultPromise = gateway.openSession(buildSession());
      await flushUntilSocketCreated(deps.createdSockets);
      deps.createdSockets[0]?.simulateOpen();
      await resultPromise;
      expect(customBuilder).toHaveBeenCalledWith({
        relayUrl: RELAY_URL,
        serverSessionId: SERVER_SESSION_ID,
        streamToken: STREAM_TOKEN,
        protocolVersion: '1.0',
      });
      expect(deps.createdUrls[0]).toBe(
        `${RELAY_URL}/custom?t=${STREAM_TOKEN}&s=${SERVER_SESSION_ID}&v=1.0`,
      );
    });

    it('sends session.start envelope on open', async () => {
      const deps = buildDependencies();
      const gateway = createRelayWebSocketGateway(deps);
      const resultPromise = gateway.openSession(buildSession());
      await flushUntilSocketCreated(deps.createdSockets);
      const socket = deps.createdSockets[0];
      socket?.simulateOpen();
      await resultPromise;
      expect(socket?.sentMessages.length).toBeGreaterThan(0);
      const first = socket?.sentMessages[0] ?? '';
      const parsed: unknown = JSON.parse(first);
      // Relay client-events.ts sessionStartPayload が必須する 4 field を全て含むか
      expect(parsed).toMatchObject({
        eventType: 'session.start',
        sessionId: SESSION_ID,
        payload: {
          sourceLanguage: 'en-US',
          autoDetectLanguage: false,
          targetLanguage: 'ja-JP',
          translationEnabled: true,
        },
      });
    });

    it('propagates tokenIssuer failure as DomainError', async () => {
      const deps = buildDependencies({
        tokenIssuer: () =>
          errAsync(
            invariantViolationError({
              invariant: 'token-issuance-failed',
              details: 'http 401',
            }),
          ),
      });
      const gateway = createRelayWebSocketGateway(deps);
      const result = await gateway.openSession(buildSession());
      expect(result.isErr()).toBe(true);
      expect(deps.createdSockets).toHaveLength(0);
    });
  });

  describe('sendAudioFrame', () => {
    it('sends audio.frame envelope with pcm16Base64 payload', async () => {
      const deps = buildDependencies();
      const gateway = createRelayWebSocketGateway(deps);
      const openPromise = gateway.openSession(buildSession());
      await flushUntilSocketCreated(deps.createdSockets);
      deps.createdSockets[0]?.simulateOpen();
      await openPromise;

      const result = await gateway.sendAudioFrame({
        sessionIdentifier,
        sequenceNumber: 5,
        sampleRate: 16000,
        channels: 1,
        pcm16Base64: 'AAABAAIAAwA=',
        capturedAt: '2026-04-21T00:00:01.000Z',
        durationMs: 100,
      });
      expect(result.isOk()).toBe(true);
      const sent = deps.createdSockets[0]?.sentMessages ?? [];
      const last: unknown = JSON.parse(sent[sent.length - 1] ?? '{}');
      expect(last).toMatchObject({
        eventType: 'audio.frame',
        sessionId: SESSION_ID,
        payload: {
          audioBase64: 'AAABAAIAAwA=',
          encoding: 'pcm_s16le',
          sampleRateHz: 16000,
          channels: 1,
          frameDurationMs: 100,
        },
      });
    });

    it('fails when no session has been opened yet', async () => {
      const deps = buildDependencies();
      const gateway = createRelayWebSocketGateway(deps);
      const result = await gateway.sendAudioFrame({
        sessionIdentifier,
        sequenceNumber: 1,
        sampleRate: 16000,
        channels: 1,
        pcm16Base64: 'AAA=',
        capturedAt: '2026-04-21T00:00:00.000Z',
        durationMs: 100,
      });
      expect(result.isErr()).toBe(true);
    });
  });

  describe('subscribe', () => {
    it('dispatches parsed RelayEvents to registered listeners', async () => {
      const deps = buildDependencies();
      const gateway = createRelayWebSocketGateway(deps);
      const openPromise = gateway.openSession(buildSession());
      await flushUntilSocketCreated(deps.createdSockets);
      deps.createdSockets[0]?.simulateOpen();
      await openPromise;

      const received: RelayEvent[] = [];
      const unsubscribe = gateway.subscribe(sessionIdentifier, (event) => {
        received.push(event);
      });

      deps.createdSockets[0]?.simulateMessage(
        JSON.stringify({
          eventType: 'session.ready',
          sessionId: SESSION_ID,
          sequence: 1,
          timestamp: '2026-04-21T00:00:00.500Z',
          payload: { state: 'capturing', heartbeatIntervalSec: 15, streamToken: 'tok' },
        }),
      );

      expect(received).toHaveLength(1);
      expect(received[0]?.type).toBe('session.ready');
      unsubscribe();

      deps.createdSockets[0]?.simulateMessage(
        JSON.stringify({
          eventType: 'session.ready',
          sessionId: SESSION_ID,
          sequence: 2,
          timestamp: '2026-04-21T00:00:01.000Z',
          payload: { state: 'capturing', heartbeatIntervalSec: 15, streamToken: 'tok2' },
        }),
      );
      expect(received).toHaveLength(1);
    });

    it('ignores session.pong messages (heartbeat response)', async () => {
      const deps = buildDependencies();
      const gateway = createRelayWebSocketGateway(deps);
      const openPromise = gateway.openSession(buildSession());
      await flushUntilSocketCreated(deps.createdSockets);
      deps.createdSockets[0]?.simulateOpen();
      await openPromise;

      const received: RelayEvent[] = [];
      gateway.subscribe(sessionIdentifier, (event) => {
        received.push(event);
      });

      deps.createdSockets[0]?.simulateMessage(
        JSON.stringify({
          eventType: 'session.pong',
          sessionId: SESSION_ID,
          sequence: 0,
          timestamp: '2026-04-21T00:00:15.000Z',
          payload: {},
        }),
      );
      expect(received).toHaveLength(0);
    });
  });

  describe('closeSession', () => {
    it('closes the socket and sends session.stop envelope', async () => {
      const deps = buildDependencies();
      const gateway = createRelayWebSocketGateway(deps);
      const openPromise = gateway.openSession(buildSession());
      await flushUntilSocketCreated(deps.createdSockets);
      deps.createdSockets[0]?.simulateOpen();
      await openPromise;

      const result = await gateway.closeSession(sessionIdentifier);
      expect(result.isOk()).toBe(true);
      expect(deps.createdSockets[0]?.isClosed).toBe(true);
      const sent = deps.createdSockets[0]?.sentMessages ?? [];
      const stopEnvelope = sent.find((s) => s.includes('session.stop'));
      expect(stopEnvelope).toBeDefined();
    });

    it('is a no-op when session was never opened', async () => {
      const deps = buildDependencies();
      const gateway = createRelayWebSocketGateway(deps);
      const result = await gateway.closeSession(sessionIdentifier);
      expect(result.isOk()).toBe(true);
    });
  });

  /**
   * PR #131 follow-up: relay-api が `session.error(STT_STREAM_FAILED,
   * retryable=true)` を emit したとき、extension 側 gateway が socket を
   * tear-down し以降の sendAudioFrame を弾くことを検証する。これがないと
   * audio frame pump が死んだ stream に frame を送り続け、server 側は
   * `REJECTING audio.frame — activeStream=null` を延々とログに残す。
   */
  describe('session.error(retryable=true) teardown', () => {
    it('closes the socket and removes connection when session.error(retryable=true, fatal=false) is received', async () => {
      const deps = buildDependencies();
      const gateway = createRelayWebSocketGateway(deps);
      const openPromise = gateway.openSession(buildSession());
      await flushUntilSocketCreated(deps.createdSockets);
      deps.createdSockets[0]?.simulateOpen();
      await openPromise;

      const received: RelayEvent[] = [];
      gateway.subscribe(sessionIdentifier, (event) => {
        received.push(event);
      });

      // relay-api から session.error(STT_STREAM_FAILED) を送信
      deps.createdSockets[0]?.simulateMessage(
        JSON.stringify({
          eventType: 'session.error',
          sessionId: SESSION_ID,
          sequence: 1,
          timestamp: '2026-04-21T00:00:01.000Z',
          payload: {
            code: 'STT_STREAM_FAILED',
            message: 'sendFrame failed: STT stream closed',
            retryable: true,
            fatal: false,
          },
        }),
      );

      // listener には event が届く (上位 use case 側で state 遷移させる)
      expect(received).toHaveLength(1);
      expect(received[0]).toMatchObject({
        type: 'session.error',
        code: 'STT_STREAM_FAILED',
        retryable: true,
      });

      // gateway が socket を tear-down する
      expect(deps.createdSockets[0]?.isClosed).toBe(true);

      // 以降の sendAudioFrame は `relay-no-active-session` で拒否される (audio
      // frame pump 側の既存エラー経路に合流、上位で pump 停止判断される)
      const frameResult = await gateway.sendAudioFrame({
        sessionIdentifier,
        sequenceNumber: 0,
        capturedAt: '2026-04-21T00:00:02.000Z',
        frameDurationMs: 100,
        pcm16Base64: 'AAAA=',
      });
      expect(frameResult.isErr()).toBe(true);
      if (frameResult.isErr()) {
        expect(frameResult.error.kind).toBe('invariant-violation');
      }
    });

    it('does not tear down on fatal=true errors (those end the session regardless)', async () => {
      const deps = buildDependencies();
      const gateway = createRelayWebSocketGateway(deps);
      const openPromise = gateway.openSession(buildSession());
      await flushUntilSocketCreated(deps.createdSockets);
      deps.createdSockets[0]?.simulateOpen();
      await openPromise;

      gateway.subscribe(sessionIdentifier, () => undefined);

      // fatal=true のケース: 上位 use case が session.stop を発火する想定なので
      // gateway は tear-down しない (通常の close 経路に委ねる)
      deps.createdSockets[0]?.simulateMessage(
        JSON.stringify({
          eventType: 'session.error',
          sessionId: SESSION_ID,
          sequence: 1,
          timestamp: '2026-04-21T00:00:01.000Z',
          payload: {
            code: 'INTERNAL_ERROR',
            message: 'irrecoverable',
            retryable: false,
            fatal: true,
          },
        }),
      );

      // tear-down されないため socket は open のまま (上位が closeSession する)
      expect(deps.createdSockets[0]?.isClosed).toBe(false);
    });

    it('does not tear down on non-retryable transient errors (e.g. VALIDATION_ERROR)', async () => {
      const deps = buildDependencies();
      const gateway = createRelayWebSocketGateway(deps);
      const openPromise = gateway.openSession(buildSession());
      await flushUntilSocketCreated(deps.createdSockets);
      deps.createdSockets[0]?.simulateOpen();
      await openPromise;

      gateway.subscribe(sessionIdentifier, () => undefined);

      deps.createdSockets[0]?.simulateMessage(
        JSON.stringify({
          eventType: 'session.error',
          sessionId: SESSION_ID,
          sequence: 1,
          timestamp: '2026-04-21T00:00:01.000Z',
          payload: {
            code: 'VALIDATION_ERROR',
            message: 'invalid event',
            retryable: false,
            fatal: false,
          },
        }),
      );

      // retryable=false / fatal=false (例: 単発の VALIDATION_ERROR) は続行可能。
      // gateway は socket を維持する。
      expect(deps.createdSockets[0]?.isClosed).toBe(false);
    });
  });
});
