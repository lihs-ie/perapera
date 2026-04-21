import type { FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import { type AccessTokenVerifier } from '../../application/ports/access-token-verifier';

/**
 * IMPL-430 HTTP access token Bearer 検証 preHandler hook。
 *
 * api-specification §2.3 「HTTP 制御 API は拡張利用者に紐づくアクセストークン」
 * に対応。POST /sessions / GET /sessions/:id など HTTP 制御 API に適用する。
 *
 * 検証フロー:
 * 1. `Authorization` ヘッダが `Bearer ` で始まることを確認
 * 2. トークンを切り出して `AccessTokenVerifier.verify` に渡す
 * 3. 失敗時は 401 UNAUTHORIZED を送信して後続処理を停止
 *
 * 成功時は何もせず次の hook / handler へ (request 拡張プロパティは現時点では
 * 付与しない。将来の audit 用に token hash 等を attach することは可能)。
 */
export const createBearerAuthPreHandler = (
  verifier: AccessTokenVerifier,
): preHandlerAsyncHookHandler => {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | void> => {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      reply.code(401);
      await reply.send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authorization header with Bearer scheme is required',
        },
        meta: { requestId: request.id },
      });
      return reply;
    }
    const token = header.slice('Bearer '.length).trim();
    const result = verifier.verify(token);
    if (result.isErr()) {
      reply.code(401);
      await reply.send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'access token is invalid or expired',
        },
        meta: { requestId: request.id },
      });
      return reply;
    }
  };
};
