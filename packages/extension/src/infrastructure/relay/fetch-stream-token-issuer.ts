import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import { z } from 'zod';
import { type SourceSession } from '../../domain/session/source-session';
import { type SourceType } from '../../domain/session/source-type';
import { invariantViolationError, type DomainError } from '../../domain/shared/errors';
import { type StreamTokenIssuer, type StreamTokenIssuerResult } from './relay-websocket-gateway';

/**
 * POST /sessions 成功レスポンス (api-specification.md §4.2):
 * 全体は `{ data: {...}, meta: { requestId } }` envelope。
 */
const postSessionsDataSchema = z.object({
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

const postSessionsResponseSchema = z.object({
  data: postSessionsDataSchema,
  meta: z
    .object({ requestId: z.string().min(1) })
    .partial()
    .optional(),
});

/**
 * api-specification.md §4.2 と整合する overlayTarget discriminated union。
 * Relay 側 `issue-stream-token-dto.ts` の zod schema と shape を揃える必要がある:
 * - `{ kind: 'tab', tabId }` — 対象タブに overlay を描画
 * - `{ kind: 'extension-monitor', pageId }` — 拡張内 monitor page (`monitor.html` 等) に描画
 */
export type OverlayTargetDescriptor =
  | Readonly<{ kind: 'tab'; tabId: number }>
  | Readonly<{ kind: 'extension-monitor'; pageId: string }>;

/**
 * User override。composition 側で settingsStore から読み込んだ override を
 * 注入する。`null` を返すと env default (`baseUrl` / `accessToken`) が使われる。
 * request 直前に毎回呼ばれるため、SettingsView で保存したら次の session.start
 * で即反映される (再起動不要)。
 */
export type RelayConnectionResolver = () => Promise<{
  baseUrl: string;
  accessToken: string;
} | null>;

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
  /**
   * Optional。request 直前に呼ばれ、非 null なら baseUrl / accessToken を
   * 差し替える (SettingsStore 由来の user override)。
   */
  resolveOverride?: RelayConnectionResolver;
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
 * IMPL-319 FetchStreamTokenIssuer (DD-401, api-specification.md §4.1 / §4.2)。
 *
 * `StreamTokenIssuer` の production 実装。`POST ${baseUrl}/sessions` に JSON を
 * 送り、Relay API から `{ data: { streamToken, relayUrl, ... }, meta }` envelope を
 * 受け取って `{ streamToken, relayUrl }` を返す。WebSocket 接続先は Relay から
 * 返された `relayUrl` をそのまま使うため、SSOT (docs) と impl の path prefix
 * drift (`/api/v1` 有無) を吸収できる。
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

  const resolveEffectiveConnection = async (): Promise<{
    baseUrl: string;
    accessToken: string;
  }> => {
    if (config.resolveOverride === undefined) {
      return { baseUrl: config.baseUrl, accessToken: config.accessToken };
    }
    try {
      const override = await config.resolveOverride();
      if (override !== null) return override;
    } catch (cause) {
      console.warn(
        '[fetch-stream-token-issuer] resolveOverride threw; falling back to env defaults:',
        cause instanceof Error ? cause.message : String(cause),
      );
    }
    return { baseUrl: config.baseUrl, accessToken: config.accessToken };
  };

  return (session) => {
    const body = buildRequestBody(session, config);
    return ResultAsync.fromPromise<{ baseUrl: string; accessToken: string }, DomainError>(
      resolveEffectiveConnection(),
      toInvariant('resolve-override'),
    )
      .andThen((effective) =>
        ResultAsync.fromPromise<Response, DomainError>(
          fetchImpl(`${effective.baseUrl}/sessions`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization: `Bearer ${effective.accessToken}`,
            },
            body: JSON.stringify(body),
          }),
          toInvariant('network'),
        ),
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
      .andThen((raw): ResultAsync<StreamTokenIssuerResult, DomainError> => {
        const parsed = postSessionsResponseSchema.safeParse(raw);
        if (!parsed.success) {
          return errAsync<StreamTokenIssuerResult, DomainError>(
            invariantViolationError({
              invariant: 'stream-token-fetch',
              details: `response schema: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
            }),
          );
        }
        return okAsync<StreamTokenIssuerResult, DomainError>({
          streamToken: parsed.data.data.streamToken,
          relayUrl: parsed.data.data.relayUrl,
          sessionId: parsed.data.data.sessionId,
        });
      });
  };
};
