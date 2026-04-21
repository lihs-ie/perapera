import { errAsync, okAsync } from 'neverthrow';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { type FastifyInstance } from 'fastify';
import { type JwtVerifiedPayload, type JwtVerifier } from '../../application/ports/jwt-verifier';
import { type IssueStreamTokenUseCase } from '../../application/use-cases/issue-stream-token-use-case';
import { invariantViolationError, type DomainError } from '../../domain/shared/errors';
import { buildApp } from '../http/server';

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

const startApp = async (verifier: JwtVerifier): Promise<AppHarness> => {
  const app = buildApp({ issueStreamTokenUseCase: noopUseCase, jwtVerifier: verifier });
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

const awaitFirstMessage = (ws: WebSocket): Promise<string> =>
  new Promise((resolve, reject) => {
    ws.once('message', (data) => {
      const buf = Array.isArray(data)
        ? Buffer.concat(data)
        : Buffer.isBuffer(data)
          ? data
          : Buffer.from(data);
      resolve(buf.toString('utf8'));
    });
    ws.once('error', reject);
  });

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

describe('WebSocket /relay route (IMPL-420)', () => {
  let harness: AppHarness | null = null;

  beforeEach(() => {
    harness = null;
  });

  afterEach(async () => {
    if (harness !== null) await harness.app.close();
  });

  it('sends session.ready event after a successful handshake', async () => {
    harness = await startApp(okVerifier);
    const ws = connectWithAuth(relayUrl(harness), 'valid.jwt.token');
    try {
      const raw = await awaitFirstMessage(ws);
      const parsed: unknown = JSON.parse(raw);
      expect(parsed).toMatchObject({
        type: 'session.ready',
        sessionId: SESSION_ID,
        heartbeatIntervalSec: 15,
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
