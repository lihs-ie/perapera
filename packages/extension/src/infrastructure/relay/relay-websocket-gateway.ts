import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import {
  describeDomainError,
  invariantViolationError,
  type DomainError,
} from '../../domain/shared/errors';
import { type SessionIdentifier } from '../../domain/session/session-identifier';
import { type SourceSession } from '../../domain/session/source-session';
import { type AudioFrameEnvelope } from '../../application/ports/audio-preprocessor';
import {
  type RelayEventListener,
  type RelayGateway,
  type Unsubscribe,
} from '../../application/ports/relay-gateway';
import { parseRelayServerMessage } from './relay-event-mapper';
import { type WebSocketFactory, type WebSocketLike } from './websocket-factory';

/**
 * Stream token 発行器の結果。`POST /sessions` レスポンス (api-specification.md
 * §4.2) から `streamToken` / `relayUrl` / `sessionId` の 3 値を抽出する。
 *
 * - `streamToken`: WS upgrade の Authorization 代替 token
 * - `relayUrl`: Relay API が環境ごとに提示する WS 接続先 (例:
 *   `ws://localhost:3001/relay`)。extension 側で path を組み立てずにそのまま
 *   使うことで SSOT (docs) と impl の path prefix drift (`/api/v1` 有無) を吸収
 * - `sessionId`: Relay が発行した session 識別子。WS URL の `?sessionId=` に
 *   使う (token の `sub` claim と一致するため `validateSessionIdMatch` を通過
 *   できる)。extension の local `SourceSession.sessionIdentifier` とは独立した
 *   ULID。extension 側は local id を内部 routing key に使い続けるが、Relay と
 *   の contract 用には本 field を使う
 */
export type StreamTokenIssuerResult = Readonly<{
  streamToken: string;
  relayUrl: string;
  sessionId: string;
}>;

/**
 * Stream token 発行器。`POST /sessions` 経由で Relay API から短命トークン + WS
 * endpoint を取得する HTTP クライアントを注入する。production entrypoint で
 * 実装を渡す (test では okAsync で mock)。
 */
export type StreamTokenIssuer = (
  session: SourceSession,
) => ResultAsync<StreamTokenIssuerResult, DomainError>;

export type RelayWebSocketGatewayDependencies = Readonly<{
  webSocketFactory: WebSocketFactory;
  tokenIssuer: StreamTokenIssuer;
  clock: () => number;
  /**
   * api-specification.md §4.1 `client.protocolVersion`。WS upgrade の query
   * parameter として Relay に送信する。Relay 側は `SUPPORTED_PROTOCOL_VERSIONS`
   * と照合 (相違時は 401 upgrade reject)。
   */
  protocolVersion: string;
  /**
   * Relay から返された `relayUrl` / `serverSessionId` (token.sub 一致) /
   * streamToken / protocolVersion から実 WebSocket URL を組み立てる。default は
   * `${relayUrl}?token=<jwt>&sessionId=<serverSessionId>&protocolVersion=<ver>` で、
   * 相対 path や追加 query を本番で override したい場合のみ注入する。
   */
  wsEndpointBuilder?: (params: {
    relayUrl: string;
    serverSessionId: string;
    streamToken: string;
    protocolVersion: string;
  }) => string;
  /**
   * ハートビート間隔 (ms)。default 15000 (api-specification.md §2.6 準拠)。
   * 定数なので default を許容 (mock ではない)。
   */
  heartbeatIntervalMs?: number;
}>;

const defaultWsEndpointBuilder = (params: {
  relayUrl: string;
  serverSessionId: string;
  streamToken: string;
  protocolVersion: string;
}): string => {
  const separator = params.relayUrl.includes('?') ? '&' : '?';
  return `${params.relayUrl}${separator}token=${encodeURIComponent(params.streamToken)}&sessionId=${encodeURIComponent(params.serverSessionId)}&protocolVersion=${encodeURIComponent(params.protocolVersion)}`;
};

export const DEFAULT_HEARTBEAT_INTERVAL_MS = 15000 as const;

type SessionConnection = {
  socket: WebSocketLike;
  sequence: number;
  listeners: Set<RelayEventListener>;
  heartbeatTimer: ReturnType<typeof setInterval> | null;
};

const toIsoString = (clock: () => number): string => new Date(clock()).toISOString();

const buildEnvelope = (
  eventType: string,
  sessionIdentifier: SessionIdentifier,
  sequence: number,
  timestamp: string,
  payload: Record<string, unknown>,
): string =>
  JSON.stringify({
    eventType,
    sessionId: sessionIdentifier,
    sequence,
    timestamp,
    payload,
  });

const logWarn =
  (scope: string) =>
  (error: DomainError): void => {
    console.warn(`[relay-gateway] ${scope} failed:`, describeDomainError(error));
  };

/**
 * IMPL-320 RelayWebSocketGateway (DD-105 / DD-411)。
 *
 * **本番実装で mock が利用されない設計**:
 * - `webSocketFactory` / `tokenIssuer` / `wsEndpointBuilder` / `clock` は
 *   **必須引数** (default なし)。production entrypoint で
 *   `createBrowserWebSocketFactory()` と実 HTTP クライアントを明示注入
 * - `heartbeatIntervalMs` のみ定数の default を許容 (mock ではない)
 *
 * ハートビート: 15 秒間隔で `session.ping` 送信。Relay からの `session.pong` は
 * `RelayEventMapper` が null として落とし、listener には届かない。
 *
 * NOTE: MVP スコープの simplification:
 * - 再接続ロジック (指数バックオフ) は現状未実装。上位 UseCase 層で
 *   `openSession` を再呼び出しする形で最低限の回復を達成できる
 * - サーキットブレーカーは acl.md §6 に従い後続タスクで導入
 */
export const createRelayWebSocketGateway = (
  deps: RelayWebSocketGatewayDependencies,
): RelayGateway => {
  const heartbeatMs = deps.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
  const wsEndpointBuilder = deps.wsEndpointBuilder ?? defaultWsEndpointBuilder;
  const connections = new Map<SessionIdentifier, SessionConnection>();

  const dispatchMessage = (sessionIdentifier: SessionIdentifier, data: string): void => {
    const connection = connections.get(sessionIdentifier);
    if (connection === undefined) return;
    const parseResult = parseRelayServerMessage(data);
    if (parseResult.isErr()) {
      logWarn('message-parse')(parseResult.error);
      return;
    }
    if (parseResult.value === null) return; // session.pong, silently drop
    // Relay 側の envelope は server-issued sessionId (token.sub = /POST sessions で
    // 発行された id) を載せるが、extension の repository / UseCase / registry は
    // すべて **local sessionId** (`SourceSession.sessionIdentifier`) を primary
    // key として扱う。dispatchMessage の closure からは local id が分かっている
    // ので、ここで parsed event の sessionIdentifier を local id に差し替える。
    // これをしないと handleTranscriptPartialUseCase などが server id で repo を
    // 引き `TranscriptStream not found` を返してしまう。
    const localEvent = { ...parseResult.value, sessionIdentifier };
    for (const listener of connection.listeners) {
      listener(localEvent);
    }
  };

  const startHeartbeat = (
    sessionIdentifier: SessionIdentifier,
    connection: SessionConnection,
  ): void => {
    connection.heartbeatTimer = setInterval(() => {
      if (connection.socket.readyState !== 1) return;
      connection.socket.send(
        buildEnvelope(
          'session.ping',
          sessionIdentifier,
          connection.sequence++,
          toIsoString(deps.clock),
          {},
        ),
      );
    }, heartbeatMs);
  };

  return {
    openSession: (session) => {
      console.log(
        `[relay-gateway] openSession start (local sessionId=${session.sessionIdentifier})`,
      );
      return deps
        .tokenIssuer(session)
        .andThen(({ streamToken, relayUrl, sessionId }): ResultAsync<void, DomainError> => {
          console.log(
            `[relay-gateway] token issued (relayUrl=${relayUrl}, serverSessionId=${sessionId})`,
          );
          return ResultAsync.fromPromise<void, DomainError>(
            new Promise<void>((resolve, reject) => {
              const url = wsEndpointBuilder({
                relayUrl,
                serverSessionId: sessionId,
                streamToken,
                protocolVersion: deps.protocolVersion,
              });
              console.log(`[relay-gateway] connecting WebSocket to ${url}`);
              const socket = deps.webSocketFactory(url);

              const onOpen = (): void => {
                console.log(
                  `[relay-gateway] WebSocket open (session=${session.sessionIdentifier})`,
                );
                socket.removeEventListener('open', onOpen);
                const sequence = 0;
                const sessionStartEnvelope = buildEnvelope(
                  'session.start',
                  session.sessionIdentifier,
                  sequence,
                  toIsoString(deps.clock),
                  {
                    // Relay (client-events.ts `sessionStartPayload`) は
                    // `sourceLanguage?: string | null`、`autoDetectLanguage: boolean`
                    // (必須)、`targetLanguage: string`、`translationEnabled: boolean`
                    // を期待。`autoDetectLanguage` を欠かすと Zod parse fail で
                    // VALIDATION_ERROR になり、以降 audio.frame が
                    // SESSION_NOT_READY 連続発火する。
                    sourceLanguage: session.languagePair.source,
                    autoDetectLanguage: false,
                    targetLanguage: session.languagePair.target,
                    translationEnabled: true,
                  },
                );
                console.log(
                  `[relay-gateway] sending session.start (${String(sessionStartEnvelope.length)} bytes)`,
                );
                socket.send(sessionStartEnvelope);
                const connection: SessionConnection = {
                  socket,
                  sequence: sequence + 1,
                  listeners: new Set(),
                  heartbeatTimer: null,
                };
                socket.addEventListener('message', (event) => {
                  if (event instanceof MessageEvent && typeof event.data === 'string') {
                    dispatchMessage(session.sessionIdentifier, event.data);
                  }
                });
                startHeartbeat(session.sessionIdentifier, connection);
                connections.set(session.sessionIdentifier, connection);
                resolve();
              };
              socket.addEventListener('open', onOpen);
              socket.addEventListener('error', (event) => {
                console.error('[relay-gateway] WebSocket error before open:', event);
                reject(new Error('WebSocket error before open'));
              });
              socket.addEventListener('close', (event) => {
                const code = event instanceof CloseEvent ? String(event.code) : 'unknown';
                const reason =
                  event instanceof CloseEvent && event.reason.length > 0 ? event.reason : '-';
                console.log(
                  `[relay-gateway] WebSocket close (session=${session.sessionIdentifier}, code=${code}, reason=${reason})`,
                );
              });
            }),
            (cause) =>
              invariantViolationError({
                invariant: 'relay-handshake-failed',
                details: cause instanceof Error ? cause.message : 'unknown error',
              }),
          );
        });
    },

    sendAudioFrame: (frame: AudioFrameEnvelope) => {
      const connection = connections.get(frame.sessionIdentifier);
      if (connection === undefined) {
        return errAsync<void, DomainError>(
          invariantViolationError({
            invariant: 'relay-no-active-session',
            details: `sendAudioFrame called before openSession for ${frame.sessionIdentifier}`,
          }),
        );
      }
      if (connection.socket.readyState !== 1) {
        return errAsync<void, DomainError>(
          invariantViolationError({
            invariant: 'relay-socket-not-open',
            details: `socket readyState=${String(connection.socket.readyState)}`,
          }),
        );
      }
      const payload = {
        chunkId: `chk_${String(frame.sequenceNumber).padStart(6, '0')}`,
        audioBase64: frame.pcm16Base64,
        encoding: 'pcm_s16le',
        sampleRateHz: frame.sampleRate,
        channels: frame.channels,
        frameDurationMs: frame.durationMs,
        capturedAt: frame.capturedAt,
      };
      connection.socket.send(
        buildEnvelope(
          'audio.frame',
          frame.sessionIdentifier,
          connection.sequence++,
          toIsoString(deps.clock),
          payload,
        ),
      );
      return okAsync(undefined);
    },

    closeSession: (sessionIdentifier) => {
      const connection = connections.get(sessionIdentifier);
      if (connection === undefined) return okAsync(undefined);
      if (connection.heartbeatTimer !== null) clearInterval(connection.heartbeatTimer);
      if (connection.socket.readyState === 1) {
        connection.socket.send(
          buildEnvelope(
            'session.stop',
            sessionIdentifier,
            connection.sequence++,
            toIsoString(deps.clock),
            { reason: 'user_requested' },
          ),
        );
      }
      connection.socket.close(1000, 'normal closure');
      connections.delete(sessionIdentifier);
      return okAsync(undefined);
    },

    subscribe: (sessionIdentifier, listener): Unsubscribe => {
      let connection = connections.get(sessionIdentifier);
      if (connection === undefined) {
        // Register a "pending" connection placeholder. When openSession runs
        // for this identifier, it will replace this entry but listeners will
        // need to be re-registered. To keep the API simple, we require
        // subscribe to be called *after* openSession completes (per the port
        // contract — subscribe docs assume an active session).
        // For safety, attach to a detached listener set that gets discarded.
        const detached = new Set<RelayEventListener>([listener]);
        return () => {
          detached.delete(listener);
        };
      }
      connection.listeners.add(listener);
      return () => {
        connection = connections.get(sessionIdentifier);
        connection?.listeners.delete(listener);
      };
    },
  };
};
