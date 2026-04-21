import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { RawData, WebSocket } from 'ws';
import { type JwtVerifier } from '../../application/ports/jwt-verifier';
import { toHttpErrorEnvelope } from '../http/error-mapper';
import { parseClientEvent, type ClientEvent } from './client-events';
import {
  buildSessionError,
  buildSessionPong,
  buildSessionReady,
  serializeServerEvent,
  type SessionErrorCode,
} from './server-events';
import { authorizeRelayUpgrade, type RelayAuthorizedContext } from './relay-auth';

export type RelayRouteDependencies = Readonly<{
  jwtVerifier: JwtVerifier;
  clock: () => string;
  heartbeatIntervalSec: number;
}>;

type RelayQuery = Readonly<{
  sessionId?: string;
  protocolVersion?: string;
}>;

/**
 * preValidation で確立した認可情報を handler へ渡す。request 拡張プロパティは
 * WebSocket upgrade 経路で参照が不安定なため、WeakMap で明示的に受け渡す。
 */
const contextMap = new WeakMap<FastifyRequest, RelayAuthorizedContext>();

const decodeRawMessage = (data: RawData): string => {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  return Buffer.from(data).toString('utf8');
};

/**
 * 接続ごとの server event `sequence` 採番器。
 */
const createSequencer = (): (() => number) => {
  let next = 0;
  return () => next++;
};

/**
 * クライアントイベントを dispatch する。MVP では session.ping のみ応答を返し、
 * それ以外は log に記録するだけ (IMPL-441/442 で mock STT/翻訳と連携する際に
 * 実処理を接続する)。
 */
const dispatchClientEvent = (
  event: ClientEvent,
  send: (eventJson: string) => void,
  deps: RelayRouteDependencies,
  context: RelayAuthorizedContext,
  nextSequence: () => number,
  logger: FastifyRequest['log'],
): void => {
  switch (event.eventType) {
    case 'session.ping': {
      send(
        serializeServerEvent(
          buildSessionPong({
            sessionId: context.sessionId,
            sequence: nextSequence(),
            timestamp: deps.clock(),
          }),
        ),
      );
      return;
    }
    case 'session.start':
    case 'audio.frame':
    case 'session.pause':
    case 'session.resume':
    case 'session.stop': {
      logger.debug(
        { eventType: event.eventType, sequence: event.sequence },
        'client event received',
      );
      return;
    }
  }
};

const sendSessionError = (
  socket: WebSocket,
  context: RelayAuthorizedContext,
  nextSequence: () => number,
  clock: () => string,
  params: {
    code: SessionErrorCode;
    message: string;
    retryable: boolean;
    fatal: boolean;
  },
): void => {
  socket.send(
    serializeServerEvent(
      buildSessionError({
        sessionId: context.sessionId,
        sequence: nextSequence(),
        timestamp: clock(),
        code: params.code,
        message: params.message,
        retryable: params.retryable,
        fatal: params.fatal,
      }),
    ),
  );
};

/**
 * IMPL-420 + IMPL-421 + IMPL-422 (部分) `/relay` WebSocket 接続ルート。
 *
 * 対応範囲:
 * - upgrade 時認可 (JWT verify + sessionId ↔ sub 一致 + protocolVersion)
 * - `session.ready` 送信 (api-specification §6.3 準拠)
 * - client event 受信 + JSON / Zod validation
 * - `session.ping` → `session.pong` 応答
 * - 不正 payload は `session.error(VALIDATION_ERROR)` を返信 (接続は維持)
 *
 * 未対応 (後続):
 * - `session.start` / `audio.frame` に対応する STT / 翻訳 dispatch (IMPL-441/442)
 * - `pause` / `resume` / `stop` の session state 連携
 * - `transcript.*` / `translation.final` サーバーイベント生成 (IMPL-441/442)
 * - heartbeat (IMPL-423)
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
      },
    },
    (socket, request) => {
      const context = contextMap.get(request);
      if (context === undefined) {
        socket.close(1011, 'relay context missing');
        return;
      }
      contextMap.delete(request);

      const nextSequence = createSequencer();
      socket.send(
        serializeServerEvent(
          buildSessionReady({
            sessionId: context.sessionId,
            sequence: nextSequence(),
            timestamp: deps.clock(),
            heartbeatIntervalSec: deps.heartbeatIntervalSec,
          }),
        ),
      );

      socket.on('message', (raw: RawData) => {
        const text = decodeRawMessage(raw);
        const parsed = parseClientEvent(text);
        if (parsed.isErr()) {
          const detail =
            parsed.error.kind === 'invariant-violation' ? parsed.error.details : 'invalid event';
          sendSessionError(socket, context, nextSequence, deps.clock, {
            code: 'VALIDATION_ERROR',
            message: detail,
            retryable: false,
            fatal: false,
          });
          return;
        }
        try {
          dispatchClientEvent(
            parsed.value,
            (json) => socket.send(json),
            deps,
            context,
            nextSequence,
            request.log,
          );
        } catch (cause) {
          request.log.error({ err: cause }, 'dispatch failure');
          sendSessionError(socket, context, nextSequence, deps.clock, {
            code: 'INTERNAL_ERROR',
            message: cause instanceof Error ? cause.message : 'unknown internal error',
            retryable: false,
            fatal: true,
          });
        }
      });
    },
  );
};
