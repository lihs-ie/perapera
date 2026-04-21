import type { FastifyInstance } from 'fastify';
import { type AccessTokenVerifier } from '../../../application/ports/access-token-verifier';
import { type IssueStreamTokenUseCase } from '../../../application/use-cases/issue-stream-token-use-case';
import { createBearerAuthPreHandler } from '../access-token-hook';
import { toHttpErrorEnvelope } from '../error-mapper';

export type SessionsRouteDependencies = Readonly<{
  issueStreamTokenUseCase: IssueStreamTokenUseCase;
  accessTokenVerifier: AccessTokenVerifier;
}>;

/**
 * IMPL-411 POST /sessions HTTP route + IMPL-430 access token Bearer 認証。
 *
 * api-specification §4.2:
 * - 入力: `IssueStreamTokenInput` (UseCase 側で Zod 検証)
 * - 成功: 201 Created + `{ data, meta: { requestId } }`
 * - 失敗: DomainError を `toHttpErrorEnvelope` で HTTP ステータスへマッピング
 *
 * preHandler で `Authorization: Bearer <access_token>` を `AccessTokenVerifier`
 * (env 由来の静的シークレット) で検証。失敗時は 401 で停止。
 */
export const registerSessionsRoute = (
  app: FastifyInstance,
  deps: SessionsRouteDependencies,
): void => {
  app.post(
    '/sessions',
    { preHandler: createBearerAuthPreHandler(deps.accessTokenVerifier) },
    async (request, reply) => {
      const result = await deps.issueStreamTokenUseCase(request.body);
      return result.match(
        (output) => {
          reply.code(201);
          return { data: output, meta: { requestId: request.id } };
        },
        (error) => {
          const envelope = toHttpErrorEnvelope(error);
          reply.code(envelope.status);
          return { ...envelope.body, meta: { requestId: request.id } };
        },
      );
    },
  );
};
