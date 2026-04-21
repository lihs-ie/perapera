import type { FastifyInstance, FastifyRequest } from 'fastify';
import { type JwtVerifier } from '../../application/ports/jwt-verifier';
import { toHttpErrorEnvelope } from '../http/error-mapper';
import { authorizeRelayUpgrade, type RelayAuthorizedContext } from './relay-auth';

export type RelayRouteDependencies = Readonly<{
  jwtVerifier: JwtVerifier;
}>;

type RelayQuery = Readonly<{
  sessionId?: string;
  protocolVersion?: string;
}>;

/**
 * preValidation で確立した認可情報を handler へ渡す。request オブジェクトの
 * 拡張プロパティは型的に扱いづらく、WebSocket upgrade 経路で参照が変わる
 * リスクがあるため、WeakMap 経由で明示的に受け渡す。
 */
const contextMap = new WeakMap<FastifyRequest, RelayAuthorizedContext>();

/**
 * IMPL-420 `/relay` WebSocket 接続ルート。
 *
 * api-specification §6.1:
 * - URL: `/relay?sessionId={sessionId}&protocolVersion=1.0`
 * - 認証: `Authorization: Bearer <stream_token>`
 *
 * 本 PR は upgrade 時の **認可チェック** と **session.ready** 送信のみ。
 * client/server event loop は IMPL-421 / 422、heartbeat は IMPL-423 で追加。
 */
export const registerRelayRoute = (app: FastifyInstance, deps: RelayRouteDependencies): void => {
  app.get<{ Querystring: RelayQuery }>(
    '/relay',
    {
      websocket: true,
      preValidation: async (request, reply) => {
        const result = await authorizeRelayUpgrade(
          {
            authorizationHeader: request.headers.authorization,
            sessionIdQuery: request.query.sessionId,
            protocolVersionQuery: request.query.protocolVersion,
          },
          deps.jwtVerifier,
        );
        if (result.isErr()) {
          const envelope = toHttpErrorEnvelope(result.error);
          const status = envelope.status === 400 ? 401 : envelope.status;
          reply.code(status);
          await reply.send({ ...envelope.body, meta: { requestId: request.id } });
          return reply;
        }
        contextMap.set(request, result.value);
        request.log.info(
          {
            sessionId: result.value.sessionId,
            jti: result.value.tokenPayload.jti,
            protocolVersion: result.value.protocolVersion,
          },
          'relay upgrade authorized',
        );
      },
    },
    (socket, request) => {
      const context = contextMap.get(request);
      if (context === undefined) {
        socket.close(1011, 'relay context missing');
        return;
      }
      contextMap.delete(request);
      socket.send(
        JSON.stringify({
          type: 'session.ready',
          sessionId: context.sessionId,
          streamToken: context.tokenPayload.jti,
          heartbeatIntervalSec: 15,
        }),
      );
      // IMPL-421 / 422 / 423 で incoming message, server events, heartbeat を実装。
      // 現時点では送信後に接続を保持するだけ (close せず idle 維持)。
    },
  );
};
