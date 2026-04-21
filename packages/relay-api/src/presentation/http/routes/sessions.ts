import type { FastifyInstance } from 'fastify';
import { type IssueStreamTokenUseCase } from '../../../application/use-cases/issue-stream-token-use-case';
import { toHttpErrorEnvelope } from '../error-mapper';

export type SessionsRouteDependencies = Readonly<{
  issueStreamTokenUseCase: IssueStreamTokenUseCase;
}>;

/**
 * IMPL-411 POST /sessions HTTP route。
 *
 * api-specification §4.2 に従い:
 * - 入力: `IssueStreamTokenInput` (UseCase 側で Zod 検証)
 * - 成功: 201 Created + `{ data, meta: { requestId } }`
 * - 失敗: DomainError を `toHttpErrorEnvelope` で HTTP ステータスへマッピング
 *
 * 認証 (IMPL-430: アクセストークン Bearer 検証) は後続 PR で preHandler hook
 * として追加する。本 route では stateless JWT 発行の shape のみ確立する。
 */
export const registerSessionsRoute = (
  app: FastifyInstance,
  deps: SessionsRouteDependencies,
): void => {
  app.post('/sessions', async (request, reply) => {
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
  });
};
