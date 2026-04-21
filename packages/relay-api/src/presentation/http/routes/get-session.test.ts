import { errAsync, ok, okAsync } from 'neverthrow';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type FastifyInstance } from 'fastify';
import { type AccessTokenVerifier } from '../../../application/ports/access-token-verifier';
import { type JwtVerifiedPayload, type JwtVerifier } from '../../../application/ports/jwt-verifier';
import { type IssueStreamTokenUseCase } from '../../../application/use-cases/issue-stream-token-use-case';
import { invariantViolationError, type DomainError } from '../../../domain/shared/errors';
import { buildApp } from '../server';

const ACCESS_TOKEN = 'access-token-test-fixture-xxxx';
const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const OTHER_SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7XX';
const STREAM_TOKEN = 'header.payload.signature';

const accessTokenVerifier: AccessTokenVerifier = {
  verify: () => ok(undefined),
};

const buildOkJwtVerifier = (sub: string): JwtVerifier => ({
  verify: () =>
    okAsync<JwtVerifiedPayload, DomainError>({
      jti: 'strm_01HZX8Y1R8M7D3Q2P4T5V6W7A2',
      sub,
      expiresAtEpochSec: Math.floor(Date.now() / 1000) + 600,
      issuedAtEpochSec: Math.floor(Date.now() / 1000) - 10,
      claims: {
        sourceType: 'tab',
        displayName: 'YouTube Live',
        sourceLanguage: 'en-US',
        autoDetectLanguage: false,
        targetLanguage: 'ja-JP',
        overlayTarget: { kind: 'tab', tabId: 42 },
        client: { extensionVersion: '0.1.0', protocolVersion: '1.0' },
        createdAt: '2026-04-21T00:00:00.000Z',
      },
    }),
});

const failingJwtVerifier: JwtVerifier = {
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

const buildTestApp = (jwtVerifier: JwtVerifier) =>
  buildApp({
    issueStreamTokenUseCase: noopUseCase,
    jwtVerifier,
    accessTokenVerifier,
  });

describe('GET /sessions/:sessionId (IMPL-412 stateless)', () => {
  let app: FastifyInstance | null = null;

  beforeEach(() => {
    app = null;
  });

  afterEach(async () => {
    if (app !== null) await app.close();
  });

  it('returns 200 with session metadata decoded from stream token claims', async () => {
    app = buildTestApp(buildOkJwtVerifier(SESSION_ID));
    const response = await app.inject({
      method: 'GET',
      url: `/sessions/${SESSION_ID}`,
      headers: {
        authorization: `Bearer ${ACCESS_TOKEN}`,
        'x-stream-token': STREAM_TOKEN,
      },
    });
    expect(response.statusCode).toBe(200);
    const parsed: unknown = response.json();
    expect(parsed).toMatchObject({
      data: {
        sessionId: SESSION_ID,
        state: 'capturing',
        sourceType: 'tab',
        displayName: 'YouTube Live',
        sourceLanguage: 'en-US',
        targetLanguage: 'ja-JP',
        startedAt: '2026-04-21T00:00:00.000Z',
        lastEventAt: null,
        lastErrorCode: null,
      },
    });
  });

  it('returns 401 when access token is missing', async () => {
    app = buildTestApp(buildOkJwtVerifier(SESSION_ID));
    const response = await app.inject({
      method: 'GET',
      url: `/sessions/${SESSION_ID}`,
      headers: { 'x-stream-token': STREAM_TOKEN },
    });
    expect(response.statusCode).toBe(401);
  });

  it('returns 400 VALIDATION_ERROR when X-Stream-Token is missing', async () => {
    app = buildTestApp(buildOkJwtVerifier(SESSION_ID));
    const response = await app.inject({
      method: 'GET',
      url: `/sessions/${SESSION_ID}`,
      headers: { authorization: `Bearer ${ACCESS_TOKEN}` },
    });
    expect(response.statusCode).toBe(400);
    const parsed: unknown = response.json();
    expect(parsed).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('returns 401 UNAUTHORIZED when stream token fails verification', async () => {
    app = buildTestApp(failingJwtVerifier);
    const response = await app.inject({
      method: 'GET',
      url: `/sessions/${SESSION_ID}`,
      headers: {
        authorization: `Bearer ${ACCESS_TOKEN}`,
        'x-stream-token': STREAM_TOKEN,
      },
    });
    expect(response.statusCode).toBe(401);
  });

  it('returns 400 when sessionId path does not match stream token sub', async () => {
    app = buildTestApp(buildOkJwtVerifier(OTHER_SESSION_ID));
    const response = await app.inject({
      method: 'GET',
      url: `/sessions/${SESSION_ID}`,
      headers: {
        authorization: `Bearer ${ACCESS_TOKEN}`,
        'x-stream-token': STREAM_TOKEN,
      },
    });
    expect(response.statusCode).toBe(400);
    const parsed: unknown = response.json();
    expect(parsed).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });
});
