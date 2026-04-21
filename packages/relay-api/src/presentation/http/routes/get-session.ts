import type { FastifyInstance } from 'fastify';
import { type AccessTokenVerifier } from '../../../application/ports/access-token-verifier';
import { type JwtVerifier } from '../../../application/ports/jwt-verifier';
import { createBearerAuthPreHandler } from '../access-token-hook';

export type GetSessionRouteDependencies = Readonly<{
  accessTokenVerifier: AccessTokenVerifier;
  jwtVerifier: JwtVerifier;
}>;

type Params = Readonly<{ sessionId: string }>;
type Headers = Readonly<{ 'x-stream-token'?: string }>;

/**
 * IMPL-412 `GET /sessions/:sessionId` HTTP route。
 *
 * **stateless 設計の制約**: 本 Relay API は session の動的状態を中央保持しない
 * (PR #30 以降)。そのため api-specification §4.3 で定義される `state` /
 * `lastEventAt` / `lastErrorCode` のような "現在状態" を厳密に返せない。
 *
 * 本実装:
 * - access token (IMPL-430 preHandler) で caller を認証
 * - JWT は `X-Stream-Token` header で受け取る (POST /sessions 応答で拡張が
 *   保持する stream token をそのまま送信する想定)
 * - JWT を verify してから claims (sourceType / language / displayName 等) を
 *   response に展開する
 * - 動的 state は `'capturing'` 固定 (JWT が有効な間は active と見なす)
 * - `lastEventAt` / `lastErrorCode` は常に `null`
 *
 * JWT 未提示 / sub mismatch / 署名不正 / 期限切れ は全て 400 / 401 を返す。
 */
export const registerGetSessionRoute = (
  app: FastifyInstance,
  deps: GetSessionRouteDependencies,
): void => {
  app.get<{ Params: Params; Headers: Headers }>(
    '/sessions/:sessionId',
    {
      preHandler: createBearerAuthPreHandler(deps.accessTokenVerifier),
    },
    async (request, reply) => {
      const { sessionId } = request.params;
      const streamToken = request.headers['x-stream-token'];
      if (typeof streamToken !== 'string' || streamToken.length === 0) {
        reply.code(400);
        return {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'X-Stream-Token header is required to resolve session metadata',
          },
          meta: { requestId: request.id },
        };
      }
      const verified = await deps.jwtVerifier.verify(streamToken);
      if (verified.isErr()) {
        reply.code(401);
        return {
          error: {
            code: 'UNAUTHORIZED',
            message: 'stream token verification failed',
          },
          meta: { requestId: request.id },
        };
      }
      const payload = verified.value;
      if (payload.sub !== sessionId) {
        reply.code(400);
        return {
          error: {
            code: 'VALIDATION_ERROR',
            message: `sessionId path (${sessionId}) does not match stream token sub (${payload.sub})`,
          },
          meta: { requestId: request.id },
        };
      }
      const claims = payload.claims;
      const read = (key: string): unknown => claims[key];
      const asString = (value: unknown): string | null =>
        typeof value === 'string' ? value : null;
      return {
        data: {
          sessionId,
          state: 'capturing',
          sourceType: asString(read('sourceType')),
          displayName: asString(read('displayName')),
          sourceLanguage: asString(read('sourceLanguage')),
          targetLanguage: asString(read('targetLanguage')),
          startedAt: asString(read('createdAt')),
          lastEventAt: null,
          lastErrorCode: null,
        },
        meta: { requestId: request.id },
      };
    },
  );
};
