import { ok, okAsync } from 'neverthrow';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type FastifyInstance } from 'fastify';
import { type AccessTokenVerifier } from '../../application/ports/access-token-verifier';
import { type JwtVerifier } from '../../application/ports/jwt-verifier';
import { type IssueStreamTokenUseCase } from '../../application/use-cases/issue-stream-token-use-case';
import { createMockSttProvider } from '../../../tests/support/mock/mock-stt-provider';
import { createMockTranslationProvider } from '../../../tests/support/mock/mock-translation-provider';
import { buildApp, type AppDependencies } from './server';

const VALID_ACCESS_TOKEN = 'access-token-test-fixture-aaaa';

const noopVerifier: JwtVerifier = {
  verify: () =>
    okAsync({
      jti: 'strm_xxx',
      sub: '01HZX8Y1R8M7D3Q2P4T5V6W7A1',
      expiresAtEpochSec: Math.floor(Date.now() / 1000) + 600,
      issuedAtEpochSec: Math.floor(Date.now() / 1000),
      claims: {},
    }),
};

const fixedAccessTokenVerifier: AccessTokenVerifier = {
  verify: (bearer) => (bearer === VALID_ACCESS_TOKEN ? ok(undefined) : ok(undefined)), // ここでは rate-limit / CORS に集中し auth は通す
};

const noopUseCase: IssueStreamTokenUseCase = () =>
  okAsync({
    sessionId: '01HZX8Y1R8M7D3Q2P4T5V6W7A1',
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

const buildTestApp = (overrides: Partial<AppDependencies> = {}): FastifyInstance =>
  buildApp({
    issueStreamTokenUseCase: noopUseCase,
    jwtVerifier: noopVerifier,
    accessTokenVerifier: fixedAccessTokenVerifier,
    sttPort: createMockSttProvider(),
    translationPort: createMockTranslationProvider(),
    ...overrides,
  });

const validBody = {
  sourceType: 'tab',
  displayName: 'YouTube Live',
  sourceLanguage: 'en-US',
  autoDetectLanguage: false,
  targetLanguage: 'ja-JP',
  overlayTarget: { kind: 'tab', tabId: 42 },
  client: { extensionVersion: '0.1.0', protocolVersion: '1.0' },
};

describe('security plugins (IMPL-432/433/434)', () => {
  let app: FastifyInstance | null = null;

  beforeEach(() => {
    app = null;
  });

  afterEach(async () => {
    if (app !== null) await app.close();
  });

  describe('IMPL-434 Helmet', () => {
    it('adds standard security headers on HTTP responses', async () => {
      app = buildTestApp();
      const response = await app.inject({ method: 'GET', url: '/health' });
      expect(response.statusCode).toBe(200);
      // Helmet adds X-Content-Type-Options: nosniff by default
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });
  });

  describe('IMPL-433 CORS', () => {
    it('allows chrome-extension:// origins matching MV3 ID pattern', async () => {
      app = buildTestApp();
      const response = await app.inject({
        method: 'OPTIONS',
        url: '/sessions',
        headers: {
          origin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type, authorization',
        },
      });
      expect(response.statusCode).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBe(
        'chrome-extension://abcdefghijklmnopabcdefghijklmnop',
      );
    });

    it('rejects non-chrome-extension origins', async () => {
      app = buildTestApp();
      const response = await app.inject({
        method: 'OPTIONS',
        url: '/sessions',
        headers: {
          origin: 'https://evil.example.com',
          'access-control-request-method': 'POST',
        },
      });
      // Without allowed origin match, preflight should not echo origin
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('honors explicit allowedOrigins list when provided', async () => {
      app = buildTestApp({
        security: { allowedOrigins: ['chrome-extension://specificid123specificid123specif'] },
      });
      const ok = await app.inject({
        method: 'OPTIONS',
        url: '/sessions',
        headers: {
          origin: 'chrome-extension://specificid123specificid123specif',
          'access-control-request-method': 'POST',
        },
      });
      expect(ok.headers['access-control-allow-origin']).toBe(
        'chrome-extension://specificid123specificid123specif',
      );

      const rejected = await app.inject({
        method: 'OPTIONS',
        url: '/sessions',
        headers: {
          origin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop',
          'access-control-request-method': 'POST',
        },
      });
      expect(rejected.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('IMPL-432 Rate limit', () => {
    /*
     * `@fastify/rate-limit` の実挙動 (実際に閾値を超えたら 429 を返す) は
     * isolated node script で検証済 (commit 時点の手動確認)。ここでは統合
     * レベルで plugin が登録され、X-RateLimit 系ヘッダが付与されることを
     * 確認する。`app.inject` 同一プロセス内での rate counter は Fastify
     * バージョン依存の挙動があり、integration test 実機 (CI HTTP server) に
     * 委ねる。
     */
    it('attaches X-RateLimit-Limit header on rate-limited POST /sessions responses', async () => {
      app = buildTestApp({
        postSessionsRateLimit: { max: 30, timeWindowMs: 60_000 },
      });
      const response = await app.inject({
        method: 'POST',
        url: '/sessions',
        headers: { authorization: `Bearer ${VALID_ACCESS_TOKEN}` },
        payload: validBody,
      });
      expect(response.statusCode).toBe(201);
      // @fastify/rate-limit v10 は `X-RateLimit-Limit` 等のヘッダを付与する
      expect(response.headers['x-ratelimit-limit']).toBeDefined();
    });

    it('returns 429 RATE_LIMIT_EXCEEDED when global limit is exceeded', async () => {
      app = buildTestApp({
        security: { rateLimit: { globalMax: 1, timeWindowMs: 60_000 } },
      });
      const first = await app.inject({ method: 'GET', url: '/health' });
      expect(first.statusCode).toBe(200);
      const second = await app.inject({ method: 'GET', url: '/health' });
      expect(second.statusCode).toBe(429);
      const parsed: unknown = second.json();
      expect(parsed).toMatchObject({ error: 'RATE_LIMIT_EXCEEDED' });
    });

    it('returns 429 when POST /sessions exceeds route-level config.rateLimit.max', async () => {
      app = buildTestApp({
        postSessionsRateLimit: { max: 2, timeWindowMs: 60_000 },
      });
      for (let i = 0; i < 2; i += 1) {
        const response = await app.inject({
          method: 'POST',
          url: '/sessions',
          headers: { authorization: `Bearer ${VALID_ACCESS_TOKEN}` },
          payload: validBody,
        });
        expect(response.statusCode).toBe(201);
      }
      const over = await app.inject({
        method: 'POST',
        url: '/sessions',
        headers: { authorization: `Bearer ${VALID_ACCESS_TOKEN}` },
        payload: validBody,
      });
      expect(over.statusCode).toBe(429);
    });
  });
});
