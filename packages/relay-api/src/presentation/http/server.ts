import fastifyWebsocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import { ulid } from 'ulid';
import { type AccessTokenVerifier } from '../../application/ports/access-token-verifier';
import { type JwtVerifier } from '../../application/ports/jwt-verifier';
import {
  createIssueStreamTokenUseCase,
  type IssueStreamTokenUseCase,
} from '../../application/use-cases/issue-stream-token-use-case';
import { createJoseJwtSigner } from '../../infrastructure/auth/jose-jwt-signer';
import { createJoseJwtVerifier } from '../../infrastructure/auth/jose-jwt-verifier';
import { createStaticAccessTokenVerifier } from '../../infrastructure/auth/static-access-token-verifier';
import { loggerOptions } from '../../infrastructure/logging/logger';
import { registerRelayRoute } from '../ws/relay-route';
import { registerRequestContextHook } from './request-context-hook';
import { registerGetSessionRoute } from './routes/get-session';
import { registerHealthRoute } from './routes/health';
import { registerSessionsRoute } from './routes/sessions';
import { registerSecurityPlugins, type SecurityPluginConfig } from './security-plugins';

export type AppDependencies = Readonly<{
  issueStreamTokenUseCase: IssueStreamTokenUseCase;
  jwtVerifier: JwtVerifier;
  accessTokenVerifier: AccessTokenVerifier;
  security?: SecurityPluginConfig;
  postSessionsRateLimit?: Readonly<{ max: number; timeWindowMs: number }>;
}>;

export function buildApp(deps: AppDependencies): FastifyInstance {
  const app = Fastify({
    logger: loggerOptions,
    disableRequestLogging: false,
    trustProxy: true,
    genReqId: () => `req_${ulid()}`,
  });

  registerRequestContextHook(app);

  // security plugins を encapsulated scope 内で `await` してから HTTP route
  // を宣言することで、`@fastify/rate-limit` の route-level `config.rateLimit`
  // を確実に効かせる。
  void app.register(async (httpScope) => {
    await registerSecurityPlugins(httpScope, deps.security ?? {});
    registerHealthRoute(httpScope);
    registerSessionsRoute(httpScope, {
      issueStreamTokenUseCase: deps.issueStreamTokenUseCase,
      accessTokenVerifier: deps.accessTokenVerifier,
      rateLimit: deps.postSessionsRateLimit ?? { max: 30, timeWindowMs: 60_000 },
    });
    registerGetSessionRoute(httpScope, {
      accessTokenVerifier: deps.accessTokenVerifier,
      jwtVerifier: deps.jwtVerifier,
    });
  });

  // WebSocket 経路。@fastify/websocket の onRoute hook 適用のためにネスト
  // plugin 内で websocket plugin → relay route を順に登録する。security
  // plugins とは別 scope で影響を切り離す。
  void app.register(async (wsScope) => {
    await wsScope.register(fastifyWebsocket);
    registerRelayRoute(wsScope, {
      jwtVerifier: deps.jwtVerifier,
      clock: () => new Date().toISOString(),
      heartbeatIntervalSec: 15,
    });
  });

  return app;
}

/**
 * production dependency 配線。環境変数からシークレット等を取得し、
 * infrastructure 実装を組み合わせる。
 *
 * **stateless 設計** (infrastructure-design.md §7): Cloud Run 複数インスタンス
 * 対応のため session 中央ストアを持たない。session メタは全て JWT claims に
 * 格納し、WebSocket 側は JWT verify だけで session を復元する。
 *
 * 必要な環境変数:
 * - STREAM_TOKEN_SECRET: HS256 用 32+ bytes シークレット
 * - STREAM_TOKEN_ISSUER: JWT iss (例: https://relay.example.com)
 * - STREAM_TOKEN_AUDIENCE: JWT aud (例: perapera-extension)
 * - RELAY_PUBLIC_URL: クライアントに返す WebSocket URL (wss://...)
 * - STREAM_TOKEN_TTL_SEC: 短命トークンの TTL 秒数 (既定 1800 = 30 分)
 * - ACCESS_TOKENS: HTTP control API の Bearer トークン (カンマ区切り。
 *   鍵ローテーション時は複数指定可)。各要素は 16 文字以上
 * - CORS_ALLOWED_ORIGINS: CORS 許可 origin (カンマ区切り)。未設定時は任意の
 *   `chrome-extension://<32 chars>` を許容する dev friendly 挙動
 * - RATE_LIMIT_SESSIONS_PER_MIN: POST /sessions の per-user 上限 (既定 30)
 */
const buildProductionDependencies = (): AppDependencies => {
  const secret = process.env['STREAM_TOKEN_SECRET'];
  if (secret === undefined || secret.length < 32) {
    throw new Error('STREAM_TOKEN_SECRET env var is required (>= 32 chars)');
  }
  const issuer = process.env['STREAM_TOKEN_ISSUER'] ?? 'https://relay.local';
  const audience = process.env['STREAM_TOKEN_AUDIENCE'] ?? 'perapera-extension';
  const relayUrl = process.env['RELAY_PUBLIC_URL'] ?? 'wss://relay.local/api/v1/relay';
  const ttlSec = Number.parseInt(process.env['STREAM_TOKEN_TTL_SEC'] ?? '1800', 10);

  const secretKey = new TextEncoder().encode(secret);
  const jwtSigner = createJoseJwtSigner({ secretKey, issuer, audience });
  const jwtVerifier = createJoseJwtVerifier({ secretKey, issuer, audience });

  const rawAccessTokens = process.env['ACCESS_TOKENS'];
  if (rawAccessTokens === undefined || rawAccessTokens.trim().length === 0) {
    throw new Error('ACCESS_TOKENS env var is required (comma-separated, each >= 16 chars)');
  }
  const accessTokenVerifier = createStaticAccessTokenVerifier({
    allowedTokens: rawAccessTokens
      .split(',')
      .map((token) => token.trim())
      .filter((token) => token.length > 0),
  });

  const issueStreamTokenUseCase = createIssueStreamTokenUseCase({
    jwtSigner,
    clock: () => new Date().toISOString(),
    sessionIdFactory: () => ulid(),
    streamTokenIdFactory: () => `strm_${ulid()}`,
    relayUrl,
    tokenTtlSec: ttlSec,
    heartbeatIntervalSec: 15,
    maxConcurrentSessions: 3,
    maxFrameRatePerSecond: 10,
  });

  const allowedOrigins = process.env['CORS_ALLOWED_ORIGINS']
    ?.split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  const sessionsLimitPerMin = Number.parseInt(
    process.env['RATE_LIMIT_SESSIONS_PER_MIN'] ?? '30',
    10,
  );

  return {
    issueStreamTokenUseCase,
    jwtVerifier,
    accessTokenVerifier,
    security: allowedOrigins !== undefined ? { allowedOrigins } : {},
    postSessionsRateLimit: { max: sessionsLimitPerMin, timeWindowMs: 60_000 },
  };
};

async function start(): Promise<void> {
  const app = buildApp(buildProductionDependencies());

  const port = Number.parseInt(process.env['PORT'] ?? '3001', 10);
  const host = process.env['HOST'] ?? '0.0.0.0';

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutdown signal received, closing server');
    try {
      await app.close();
      process.exit(0);
    } catch (error) {
      app.log.error({ error }, 'error during graceful shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  try {
    await app.listen({ port, host });
  } catch (error) {
    app.log.error({ error }, 'failed to start server');
    process.exit(1);
  }
}

const isEntry = import.meta.url === `file://${process.argv[1]}`;
if (isEntry) {
  void start();
}
