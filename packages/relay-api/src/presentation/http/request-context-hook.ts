import type { FastifyInstance, FastifyRequest } from 'fastify';

/**
 * IMPL-451 structured logging 補強。
 *
 * onRequest hook で URL クエリの `sessionId` を抽出し、`request.log` を
 * child logger に置き換える。以降の全 log line に `sessionId` が bind される
 * (system-design §9.3 "構造化ログには sessionId / requestId を必ず含める")。
 *
 * `requestId` は Fastify が `genReqId` で発番したものを自動付与する。
 * `sessionId` は URL から抽出できる場合のみ bind (POST /sessions 初回は
 * session 未確立なので bind しない)。
 *
 * WebSocket 経路も Fastify 標準の HTTP upgrade を経由するため、同じ hook で
 * query.sessionId を拾える。
 */

const extractSessionId = (request: FastifyRequest): string | undefined => {
  const query: unknown = request.query;
  if (typeof query !== 'object' || query === null) return undefined;
  const candidate: unknown = Reflect.get(query, 'sessionId');
  if (typeof candidate !== 'string' || candidate.length === 0) return undefined;
  return candidate;
};

export const registerRequestContextHook = (app: FastifyInstance): void => {
  app.addHook('onRequest', (request, _reply, done) => {
    const sessionId = extractSessionId(request);
    if (sessionId !== undefined) {
      request.log = request.log.child({ sessionId });
    }
    done();
  });
};
