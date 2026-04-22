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
  const tokenIssuer = vi.fn(() => okAsync({ streamToken: STREAM_TOKEN, relayUrl: RELAY_URL }));
  const clock = vi.fn(() => Date.parse('2026-04-21T00:00:00.000Z'));

  return Object.assign(
    {
      webSocketFactory,
      tokenIssuer,
      clock,
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
    it('uses the relayUrl returned by tokenIssuer to open the WebSocket', async () => {
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
      expect(urlArg).toContain(`sessionId=${SESSION_ID}`);
    });

    it('supports a custom wsEndpointBuilder override', async () => {
      const customBuilder = vi.fn(
        (params: { relayUrl: string; sessionIdentifier: string; streamToken: string }) =>
          `${params.relayUrl}/custom?t=${params.streamToken}&s=${params.sessionIdentifier}`,
      );
      const deps = buildDependencies({ wsEndpointBuilder: customBuilder });
      const gateway = createRelayWebSocketGateway(deps);
      const resultPromise = gateway.openSession(buildSession());
      await flushUntilSocketCreated(deps.createdSockets);
      deps.createdSockets[0]?.simulateOpen();
      await resultPromise;
      expect(customBuilder).toHaveBeenCalledWith({
        relayUrl: RELAY_URL,
        sessionIdentifier: sessionIdentifier,
        streamToken: STREAM_TOKEN,
      });
      expect(deps.createdUrls[0]).toBe(`${RELAY_URL}/custom?t=${STREAM_TOKEN}&s=${SESSION_ID}`);
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
      expect(parsed).toMatchObject({
        eventType: 'session.start',
        sessionId: SESSION_ID,
        payload: {
          sourceLanguage: 'en-US',
          targetLanguage: 'ja-JP',
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
});
