import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import { z } from 'zod';
import { type SourceSession } from '../../domain/session/source-session';
import { type SourceType } from '../../domain/session/source-type';
import { invariantViolationError, type DomainError } from '../../domain/shared/errors';
import { type StreamTokenIssuer } from './relay-websocket-gateway';

/**
 * POST /sessions リクエストボディの shape (api-specification.md §4.1)。
 *
 * `displayName` / `autoDetectLanguage` / `overlayTarget` / `client` は SourceSession
 * に含まれないため、config で解決関数を注入する。
 */
const postSessionsResponseSchema = z.object({
  sessionId: z.string().min(1),
  streamToken: z.string().min(1),
  relayUrl: z.string().min(1),
  expiresAt: z.string().min(1),
  heartbeatIntervalSec: z.number().int().positive(),
  audio: z.object({
    encoding: z.string(),
    sampleRateHz: z.number().int().positive(),
    channels: z.number().int().positive(),
    frameDurationMs: z.number().int().positive(),
    transport: z.string(),
  }),
  limits: z.object({
    maxConcurrentSessions: z.number().int().positive(),
    maxFrameRatePerSecond: z.number().int().positive(),
  }),
});

export type OverlayTargetDescriptor =
  | Readonly<{ kind: 'tab'; tabId: number }>
  | Readonly<{ kind: 'monitor' }>;

export type FetchStreamTokenIssuerConfig = Readonly<{
  /** Relay API base URL (http:// or https://、末尾 / なし) */
  baseUrl: string;
  /** Long-term access token for POST /sessions (Bearer) */
  accessToken: string;
  /** 拡張バージョン (manifest.version 由来) */
  extensionVersion: string;
  /** api-spec §4.1 `client.protocolVersion` */
  protocolVersion: string;
  /** SourceSession → displayName (UI 表示用の一時名。空不可) */
  resolveDisplayName: (session: SourceSession) => string;
  /** SourceSession → overlayTarget (tab id か monitor page か) */
  resolveOverlayTarget: (session: SourceSession) => OverlayTargetDescriptor;
  /** SourceSession → autoDetectLanguage フラグ */
  resolveAutoDetectLanguage: (session: SourceSession) => boolean;
  /** Production は global `fetch`、test では in-memory fake を注入 */
  fetchImpl?: typeof fetch;
}>;

const toInvariant =
  (scope: string) =>
  (cause: unknown): DomainError =>
    invariantViolationError({
      invariant: 'stream-token-fetch',
      details: `${scope}: ${cause instanceof Error ? cause.message : String(cause)}`,
    });

const buildRequestBody = (
  session: SourceSession,
  config: FetchStreamTokenIssuerConfig,
): Record<string, unknown> => {
  const sourceLanguage: string | null = config.resolveAutoDetectLanguage(session)
    ? null
    : session.languagePair.source;
  return {
    sourceType: session.sourceType satisfies SourceType,
    displayName: config.resolveDisplayName(session),
    sourceLanguage,
    autoDetectLanguage: config.resolveAutoDetectLanguage(session),
    targetLanguage: session.languagePair.target,
    overlayTarget: config.resolveOverlayTarget(session),
    client: {
      extensionVersion: config.extensionVersion,
      protocolVersion: config.protocolVersion,
    },
  };
};

/**
 * IMPL-319 FetchStreamTokenIssuer (DD-401, api-specification.md §4.1)。
 *
 * `StreamTokenIssuer` の production 実装。`POST ${baseUrl}/sessions` に JSON を
 * 送り、Relay API から短命 `streamToken` を取得する。
 *
 * **本番実装で mock が利用されない設計**:
 * - 全 DI (resolve* callback 含む) が必須引数。default は持たない
 * - production entrypoint で `resolveDisplayName` / `resolveOverlayTarget` /
 *   `resolveAutoDetectLanguage` を明示的に渡す
 * - `fetchImpl` のみ default (global `fetch`) を許容。これは標準 API なので
 *   CLAUDE.md の `axios` 禁止方針と整合
 *
 * エラー型:
 * - network / non-2xx / JSON parse 失敗: `invariantViolationError({ invariant: 'stream-token-fetch' })`
 * - response schema 違反: 同上 (Zod error を details に埋める)
 */
export const createFetchStreamTokenIssuer = (
  config: FetchStreamTokenIssuerConfig,
): StreamTokenIssuer => {
  const fetchImpl = config.fetchImpl ?? fetch;
  const endpoint = `${config.baseUrl}/sessions`;

  return (session) => {
    const body = buildRequestBody(session, config);
    return ResultAsync.fromPromise<Response, DomainError>(
      fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.accessToken}`,
        },
        body: JSON.stringify(body),
      }),
      toInvariant('network'),
    )
      .andThen((response): ResultAsync<unknown, DomainError> => {
        if (!response.ok) {
          return errAsync<unknown, DomainError>(
            invariantViolationError({
              invariant: 'stream-token-fetch',
              details: `non-2xx: status=${response.status}`,
            }),
          );
        }
        return ResultAsync.fromPromise<unknown, DomainError>(
          response.json(),
          toInvariant('json-parse'),
        );
      })
      .andThen((raw): ResultAsync<string, DomainError> => {
        const parsed = postSessionsResponseSchema.safeParse(raw);
        if (!parsed.success) {
          return errAsync<string, DomainError>(
            invariantViolationError({
              invariant: 'stream-token-fetch',
              details: `response schema: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
            }),
          );
        }
        return okAsync<string, DomainError>(parsed.data.streamToken);
      });
  };
};

/**
 * `wsEndpointBuilder` の標準実装。Relay API の `relayUrl` を使わず、
 * `config.baseUrl` をそのまま ws(s) に差し替える (MVP 簡易版)。
 *
 * 例: `https://relay.example.com` + streamToken → `wss://relay.example.com/relay?token=...&sessionId=...`
 */
export type WsEndpointBuilderConfig = Readonly<{
  /** HTTP base URL (`http(s)://` prefix)。`wss://` に変換される */
  baseUrl: string;
  /** WebSocket パス (default `/api/v1/relay`) */
  wsPath?: string;
}>;

export const createDefaultWsEndpointBuilder = (
  config: WsEndpointBuilderConfig,
): ((sessionIdentifier: string, streamToken: string) => string) => {
  const wsPath = config.wsPath ?? '/api/v1/relay';
  const httpPrefix = config.baseUrl.startsWith('https://')
    ? 'https://'
    : config.baseUrl.startsWith('http://')
      ? 'http://'
      : 'https://';
  const rest = config.baseUrl.slice(httpPrefix.length);
  const wsPrefix = httpPrefix === 'https://' ? 'wss://' : 'ws://';
  return (sessionIdentifier, streamToken) =>
    `${wsPrefix}${rest}${wsPath}?token=${encodeURIComponent(streamToken)}&sessionId=${encodeURIComponent(sessionIdentifier)}`;
};
