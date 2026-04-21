import fastifyWebsocket from '@fastify/websocket';
import { errAsync, ok, okAsync } from 'neverthrow';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import Fastify, { type FastifyInstance } from 'fastify';
import { type AccessTokenVerifier } from '../../application/ports/access-token-verifier';
import { type JwtVerifiedPayload, type JwtVerifier } from '../../application/ports/jwt-verifier';
import { type IssueStreamTokenUseCase } from '../../application/use-cases/issue-stream-token-use-case';
import { invariantViolationError, type DomainError } from '../../domain/shared/errors';
import { buildApp } from '../http/server';
import { registerRelayRoute, type RelayRouteDependencies } from './relay-route';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const OTHER_SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7XX';

const okVerifier: JwtVerifier = {
  verify: () =>
    okAsync<JwtVerifiedPayload, DomainError>({
      jti: 'strm_01HZX8Y1R8M7D3Q2P4T5V6W7A2',
      sub: SESSION_ID,
      expiresAtEpochSec: Math.floor(Date.now() / 1000) + 600,
      issuedAtEpochSec: Math.floor(Date.now() / 1000),
      claims: { sourceType: 'tab' },
    }),
};

const failingVerifier: JwtVerifier = {
  verify: () =>
    errAsync<JwtVerifiedPayload, DomainError>(
      invariantViolationError({ invariant: 'jwt-verification-failed', details: 'expired' }),
    ),
};

const noopUseCase: IssueStreamTokenUseCase = () =>
  okAsync({
    sessionId: SESSION_ID,
    streamToken: 'jwt',
    relayUrl: 'wss://test/relay',
    expiresAt: '2026-04-21T01:00:00.000Z',
    heartbeatIntervalSec: 15,
    audio: {
      encoding: 'pcm_s16le',
      sampleRateHz: 16000,
      channels: 1,
      frameDurationMs: 100,
      transport: 'json-base64',
    },
    limits: { maxConcurrentSessions: 3, maxFrameRatePerSecond: 10 },
  });

type AppHarness = Readonly<{
  app: FastifyInstance;
  port: number;
}>;

const noopAccessTokenVerifier: AccessTokenVerifier = {
  verify: () => ok(undefined),
};

const startApp = async (verifier: JwtVerifier): Promise<AppHarness> => {
  const app = buildApp({
    issueStreamTokenUseCase: noopUseCase,
    jwtVerifier: verifier,
    accessTokenVerifier: noopAccessTokenVerifier,
  });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  return { app, port };
};

const relayUrl = (
  harness: AppHarness,
  query = `sessionId=${SESSION_ID}&protocolVersion=1.0`,
): string => `ws://127.0.0.1:${harness.port}/relay?${query}`;

const connectWithAuth = (url: string, token: string | null): WebSocket =>
  new WebSocket(
    url,
    token === null ? undefined : { headers: { authorization: `Bearer ${token}` } },
  );

const decodeMessage = (data: WebSocket.RawData): string => {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  return Buffer.from(data).toString('utf8');
};

const awaitOpen = (ws: WebSocket): Promise<void> =>
  new Promise((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });

/**
 * 入ってくる message を queue に蓄積し、pop 時に待機する helper。
 * `once('message')` を送信後に attach すると race して message を落とすため、
 * 接続直後に attach して以降すべて拾う。
 */
type MessageQueue = Readonly<{
  next: (timeoutMs?: number) => Promise<unknown>;
}>;

const createMessageQueue = (ws: WebSocket): MessageQueue => {
  const pending: unknown[] = [];
  const waiters: ((value: unknown) => void)[] = [];
  ws.on('message', (data) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(decodeMessage(data));
    } catch {
      parsed = decodeMessage(data);
    }
    const waiter = waiters.shift();
    if (waiter !== undefined) waiter(parsed);
    else pending.push(parsed);
  });
  return {
    next: (timeoutMs = 3000) =>
      new Promise<unknown>((resolve, reject) => {
        const buffered = pending.shift();
        if (buffered !== undefined) {
          resolve(buffered);
          return;
        }
        const timer = setTimeout(() => {
          reject(new Error(`timed out waiting for ws message (${timeoutMs}ms)`));
        }, timeoutMs);
        waiters.push((value) => {
          clearTimeout(timer);
          resolve(value);
        });
      }),
  };
};

const awaitUnexpectedResponse = (ws: WebSocket): Promise<{ status: number }> =>
  new Promise((resolve, reject) => {
    ws.once('unexpected-response', (_req, res) => {
      resolve({ status: res.statusCode ?? 0 });
    });
    ws.once('open', () =>
      reject(new Error('unexpected-response did not fire; handshake succeeded')),
    );
    ws.once('error', () => {
      // ignore — wrapped unexpected-response fires first on reject
    });
  });

describe('WebSocket /relay route', () => {
  let harness: AppHarness | null = null;

  beforeEach(() => {
    harness = null;
  });

  afterEach(async () => {
    if (harness !== null) await harness.app.close();
  });

  describe('IMPL-420 handshake + session.ready', () => {
    it('sends session.ready with spec §6.3 envelope + payload', async () => {
      harness = await startApp(okVerifier);
      const ws = connectWithAuth(relayUrl(harness), 'valid.jwt.token');
      const queue = createMessageQueue(ws);
      try {
        const msg = await queue.next();
        expect(msg).toMatchObject({
          eventType: 'session.ready',
          sessionId: SESSION_ID,
          sequence: 0,
          payload: {
            state: 'capturing',
            heartbeatIntervalSec: 15,
            acceptedAudio: {
              transport: 'json-base64',
              sampleRateHz: 16000,
              channels: 1,
              frameDurationMs: 100,
            },
          },
        });
      } finally {
        ws.close();
      }
    });

    it('rejects the upgrade with 401 when Authorization is missing', async () => {
      harness = await startApp(okVerifier);
      const ws = connectWithAuth(relayUrl(harness), null);
      try {
        const { status } = await awaitUnexpectedResponse(ws);
        expect(status).toBe(401);
      } finally {
        ws.close();
      }
    });

    it('rejects the upgrade with 401 when the verifier fails', async () => {
      harness = await startApp(failingVerifier);
      const ws = connectWithAuth(relayUrl(harness), 'expired.jwt');
      try {
        const { status } = await awaitUnexpectedResponse(ws);
        expect(status).toBe(401);
      } finally {
        ws.close();
      }
    });

    it('rejects the upgrade with 401 when sessionId query mismatches sub', async () => {
      harness = await startApp(okVerifier);
      const ws = connectWithAuth(
        relayUrl(harness, `sessionId=${OTHER_SESSION_ID}&protocolVersion=1.0`),
        'valid.jwt',
      );
      try {
        const { status } = await awaitUnexpectedResponse(ws);
        expect(status).toBe(401);
      } finally {
        ws.close();
      }
    });

    it('rejects the upgrade with 401 when protocolVersion is missing', async () => {
      harness = await startApp(okVerifier);
      const ws = connectWithAuth(relayUrl(harness, `sessionId=${SESSION_ID}`), 'valid.jwt');
      try {
        const { status } = await awaitUnexpectedResponse(ws);
        expect(status).toBe(401);
      } finally {
        ws.close();
      }
    });
  });

  describe('IMPL-421 client event dispatch', () => {
    it('responds to session.ping with session.pong (monotonic sequence)', async () => {
      harness = await startApp(okVerifier);
      const ws = connectWithAuth(relayUrl(harness), 'valid.jwt');
      const queue = createMessageQueue(ws);
      try {
        await awaitOpen(ws);
        const ready = await queue.next();
        expect(ready).toMatchObject({ sequence: 0 });

        ws.send(
          JSON.stringify({
            eventType: 'session.ping',
            sessionId: SESSION_ID,
            sequence: 1,
            timestamp: new Date().toISOString(),
            payload: {},
          }),
        );
        const pong = await queue.next();
        expect(pong).toMatchObject({
          eventType: 'session.pong',
          sessionId: SESSION_ID,
          sequence: 1,
          payload: {},
        });
      } finally {
        ws.close();
      }
    });

    it('sends session.error when the payload is invalid JSON', async () => {
      harness = await startApp(okVerifier);
      const ws = connectWithAuth(relayUrl(harness), 'valid.jwt');
      const queue = createMessageQueue(ws);
      try {
        await awaitOpen(ws);
        await queue.next(); // consume session.ready
        ws.send('{ not-json');
        const err = await queue.next();
        expect(err).toMatchObject({
          eventType: 'session.error',
          payload: { code: 'VALIDATION_ERROR', retryable: false, fatal: false },
        });
      } finally {
        ws.close();
      }
    });

    it('sends session.error for unknown eventType', async () => {
      harness = await startApp(okVerifier);
      const ws = connectWithAuth(relayUrl(harness), 'valid.jwt');
      const queue = createMessageQueue(ws);
      try {
        await awaitOpen(ws);
        await queue.next();
        ws.send(
          JSON.stringify({
            eventType: 'weather.update',
            sessionId: SESSION_ID,
            sequence: 1,
            timestamp: new Date().toISOString(),
            payload: {},
          }),
        );
        const err = await queue.next();
        expect(err).toMatchObject({
          eventType: 'session.error',
          payload: { code: 'VALIDATION_ERROR' },
        });
      } finally {
        ws.close();
      }
    });

    it('silently accepts session.start followed by session.ping (only pong returned)', async () => {
      harness = await startApp(okVerifier);
      const ws = connectWithAuth(relayUrl(harness), 'valid.jwt');
      const queue = createMessageQueue(ws);
      try {
        await awaitOpen(ws);
        await queue.next();
        ws.send(
          JSON.stringify({
            eventType: 'session.start',
            sessionId: SESSION_ID,
            sequence: 1,
            timestamp: new Date().toISOString(),
            payload: {
              sourceLanguage: 'en-US',
              autoDetectLanguage: false,
              targetLanguage: 'ja-JP',
              translationEnabled: true,
            },
          }),
        );
        ws.send(
          JSON.stringify({
            eventType: 'session.ping',
            sessionId: SESSION_ID,
            sequence: 2,
            timestamp: new Date().toISOString(),
            payload: {},
          }),
        );
        const nextMessage = await queue.next();
        expect(nextMessage).toMatchObject({ eventType: 'session.pong' });
      } finally {
        ws.close();
      }
    });
  });

  describe('IMPL-423 heartbeat', () => {
    const startAppWithHeartbeat = async (
      routeOverrides: Partial<RelayRouteDependencies> = {},
    ): Promise<AppHarness> => {
      const app = Fastify({ trustProxy: true });
      void app.register(fastifyWebsocket);
      void app.register((instance, _opts, done) => {
        registerRelayRoute(instance, {
          jwtVerifier: okVerifier,
          clock: () => new Date().toISOString(),
          heartbeatIntervalSec: 1,
          heartbeatCheckIntervalMs: 50,
          heartbeatTimeoutFactor: 2,
          ...routeOverrides,
        });
        done();
      });
      await app.listen({ port: 0, host: '127.0.0.1' });
      const address = app.server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      return { app, port };
    };

    const awaitClose = (ws: WebSocket): Promise<{ code: number; reason: string }> =>
      new Promise((resolve) => {
        ws.once('close', (code: number, reason: Buffer) => {
          resolve({ code, reason: reason.toString('utf8') });
        });
      });

    it('closes the connection when the client stops sending for more than interval * factor', async () => {
      harness = await startAppWithHeartbeat();
      const ws = connectWithAuth(relayUrl(harness), 'valid.jwt');
      const queue = createMessageQueue(ws);
      await awaitOpen(ws);
      await queue.next(); // consume session.ready

      const closed = await awaitClose(ws);
      expect(closed.code).toBe(1001);
      expect(closed.reason).toBe('heartbeat timeout');
    }, 8000);

    it('does not close the connection while the client keeps pinging within the interval', async () => {
      harness = await startAppWithHeartbeat();
      const ws = connectWithAuth(relayUrl(harness), 'valid.jwt');
      const queue = createMessageQueue(ws);
      await awaitOpen(ws);
      await queue.next(); // consume session.ready

      let closed = false;
      ws.once('close', () => {
        closed = true;
      });

      // heartbeatIntervalSec=1 / factor=2 → timeout=2s. Ping at 500ms intervals
      // for ~2.5s to prove the timer resets on each ping.
      for (let i = 1; i <= 5; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        ws.send(
          JSON.stringify({
            eventType: 'session.ping',
            sessionId: SESSION_ID,
            sequence: i,
            timestamp: new Date().toISOString(),
            payload: {},
          }),
        );
        await queue.next(); // consume session.pong
      }
      expect(closed).toBe(false);
      ws.close();
    }, 10000);
  });
});
