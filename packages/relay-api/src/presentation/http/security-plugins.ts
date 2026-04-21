import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';

/**
 * IMPL-432 / IMPL-433 / IMPL-434 セキュリティ plugins 登録。
 *
 * - `@fastify/cors`: `chrome-extension://` origin のみ許可 (MV3 拡張用)
 * - `@fastify/helmet`: 標準セキュリティヘッダ。`contentSecurityPolicy` は
 *   off (拡張は自前 CSP 管理)
 * - `@fastify/rate-limit`: global off (route 毎に opt-in)。access token の
 *   SHA-256 prefix を key に使用し、plaintext token がログに残らないよう
 *   設計 (api-specification §2.4 対応)
 */
export type SecurityPluginConfig = Readonly<{
  allowedOrigins?: readonly string[];
  rateLimit?: Readonly<{
    globalMax?: number;
    timeWindowMs?: number;
  }>;
}>;

const MV3_EXTENSION_ID_PATTERN = /^chrome-extension:\/\/[a-p]{32}$/;

type OriginCallback = (err: Error | null, allow: boolean) => void;
type OriginFn = (origin: string | undefined, callback: OriginCallback) => void;

/**
 * `@fastify/cors` の callback 形式の origin 関数を返す。
 * - origin 未指定 (same-origin) は常に許可
 * - 許可リスト未指定時は `chrome-extension://<32 chars>` を許可
 * - 許可リスト指定時は完全一致で判定
 * - 非許可時は `callback(null, false)` で reject
 */
const createOriginCallback = (allowedOrigins?: readonly string[]): OriginFn => {
  if (allowedOrigins === undefined || allowedOrigins.length === 0) {
    return (origin, callback) => {
      if (origin === undefined) {
        callback(null, true);
        return;
      }
      callback(null, MV3_EXTENSION_ID_PATTERN.test(origin));
    };
  }
  const allowed = new Set(allowedOrigins);
  return (origin, callback) => {
    if (origin === undefined) {
      callback(null, true);
      return;
    }
    callback(null, allowed.has(origin));
  };
};

const accessTokenHash = (bearer: string): string =>
  createHash('sha256').update(bearer).digest('hex').slice(0, 16);

const rateLimitKeyGenerator = (request: FastifyRequest): string => {
  const header = request.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return accessTokenHash(header.slice('Bearer '.length).trim());
  }
  // `request.ip` は X-Forwarded-For を含めた client IP。test (app.inject) では
  // `127.0.0.1` が渡る。IP が取れない場合の fallback も安全化する。
  return request.ip || 'unknown-client';
};

/**
 * `@fastify/rate-limit` 10.x は `register` を **await** しないと内部の store /
 * onRoute hook が初期化されないことがある。register した時点では queue 登録
 * だけで、Fastify の `ready()` 時に並行 load されるため、登録順序と route
 * 登録タイミング次第で `config.rateLimit` が無視されるケースが発生する。
 *
 * 確実に動作させるため、本関数は Promise を返し、buildApp 側で `await` する
 * ことを想定する。
 */
export const registerSecurityPlugins = async (
  app: FastifyInstance,
  config: SecurityPluginConfig = {},
): Promise<void> => {
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: false,
  });
  await app.register(fastifyCors, {
    origin: createOriginCallback(config.allowedOrigins),
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
  });
  await app.register(fastifyRateLimit, {
    global: true,
    max: config.rateLimit?.globalMax ?? 120,
    timeWindow: config.rateLimit?.timeWindowMs ?? 60_000,
    keyGenerator: rateLimitKeyGenerator,
    // `@fastify/rate-limit` v10 は errorResponseBuilder の戻り値を
    // `{ code: number, error: string, message: string, ... }` 形式として
    // 受け取り、Error として throw する。本 service のエラー envelope
    // (`{ error: { code, message }, meta: { requestId } }`) とは互換性が
    // 無いため、ここではプラグイン既定の error を使い、route handler 側 or
    // setErrorHandler でフォーマット変換は行わない (route-level の 429 は
    // 既定挙動で十分)。
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      error: 'RATE_LIMIT_EXCEEDED',
      message: `rate limit exceeded (max=${String(context.max)}, retryAfter=${String(context.after)})`,
    }),
  });
};
