import { err, ok, type Result } from 'neverthrow';
import { type ResultAsync } from 'neverthrow';
import { type JwtVerifiedPayload, type JwtVerifier } from '../../application/ports/jwt-verifier';
import { invariantViolationError, type DomainError } from '../../domain/shared/errors';

/**
 * WebSocket `/relay` 接続の認可・検証ロジック (IMPL-420 抽象部)。
 *
 * pure function として `@fastify/websocket` 層から分離する。preValidation hook
 * から呼び出し、失敗時は 401 で upgrade を拒否する。
 *
 * 検証項目 (api-specification §6.1):
 * 1. `Authorization: Bearer <stream_token>` ヘッダ **または** `?token=<stream_token>`
 *    query parameter が存在する (browser WebSocket API は custom header を
 *    設定できないため、browser client は query を使う。server-to-server は
 *    header を推奨)
 * 2. stream token が JwtVerifier で verify される
 * 3. クエリの `sessionId` が JWT の `sub` と一致する
 * 4. クエリの `protocolVersion` が既知バージョン ('1.0') と一致する
 */
export type ExtractAuthInput = Readonly<{
  authorizationHeader: string | undefined;
  tokenQuery: string | undefined;
  sessionIdQuery: string | undefined;
  protocolVersionQuery: string | undefined;
}>;

export const SUPPORTED_PROTOCOL_VERSIONS: readonly string[] = ['1.0'] as const;

const BEARER_PREFIX = 'Bearer ';

const extractBearerToken = (
  header: string | undefined,
  tokenQuery: string | undefined,
): Result<string, DomainError> => {
  // Prefer Authorization header (server-to-server / API-spec default)
  if (header?.startsWith(BEARER_PREFIX)) {
    const token = header.slice(BEARER_PREFIX.length).trim();
    if (token.length === 0) {
      return err(
        invariantViolationError({
          invariant: 'relay-empty-authorization',
          details: 'Bearer token is empty',
        }),
      );
    }
    return ok(token);
  }
  // Fallback to ?token= query param (browser WebSocket client path)
  if (tokenQuery !== undefined && tokenQuery.length > 0) {
    return ok(tokenQuery);
  }
  return err(
    invariantViolationError({
      invariant: 'relay-missing-authorization',
      details:
        'Authorization: Bearer header or ?token= query parameter is required for stream token auth',
    }),
  );
};

const validateProtocolVersion = (version: string | undefined): Result<string, DomainError> => {
  if (version === undefined) {
    return err(
      invariantViolationError({
        invariant: 'relay-missing-protocol-version',
        details: 'protocolVersion query parameter is required',
      }),
    );
  }
  if (!SUPPORTED_PROTOCOL_VERSIONS.includes(version)) {
    return err(
      invariantViolationError({
        invariant: 'relay-unsupported-protocol-version',
        details: `protocolVersion=${version} is not supported (expected one of ${SUPPORTED_PROTOCOL_VERSIONS.join(',')})`,
      }),
    );
  }
  return ok(version);
};

const validateSessionIdMatch = (
  sessionIdQuery: string | undefined,
  tokenSub: string,
): Result<string, DomainError> => {
  if (sessionIdQuery === undefined || sessionIdQuery.length === 0) {
    return err(
      invariantViolationError({
        invariant: 'relay-missing-session-id',
        details: 'sessionId query parameter is required',
      }),
    );
  }
  if (sessionIdQuery !== tokenSub) {
    return err(
      invariantViolationError({
        invariant: 'relay-session-id-mismatch',
        details: `sessionId query (${sessionIdQuery}) does not match token sub (${tokenSub})`,
      }),
    );
  }
  return ok(sessionIdQuery);
};

export type RelayAuthorizedContext = Readonly<{
  sessionId: string;
  protocolVersion: string;
  tokenPayload: JwtVerifiedPayload;
}>;

/**
 * WebSocket upgrade 前の認可チェック。成功時は `RelayAuthorizedContext` を返し、
 * 失敗時は `DomainError`。呼び出し側は `error-mapper` で HTTP ステータスに
 * 変換する (`invariant-violation` → 401 が望ましい)。
 */
export const authorizeRelayUpgrade = (
  input: ExtractAuthInput,
  verifier: JwtVerifier,
): ResultAsync<RelayAuthorizedContext, DomainError> =>
  extractBearerToken(input.authorizationHeader, input.tokenQuery)
    .asyncAndThen((token) => verifier.verify(token))
    .andThen((tokenPayload) =>
      validateProtocolVersion(input.protocolVersionQuery).andThen((protocolVersion) =>
        validateSessionIdMatch(input.sessionIdQuery, tokenPayload.sub).map(
          (sessionId): RelayAuthorizedContext => ({
            sessionId,
            protocolVersion,
            tokenPayload,
          }),
        ),
      ),
    );
