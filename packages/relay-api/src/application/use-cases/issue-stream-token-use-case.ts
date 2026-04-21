import { type ResultAsync } from 'neverthrow';
import { createRelaySession, type RelaySession } from '../../domain/session/relay-session';
import { type DomainError } from '../../domain/shared/errors';
import {
  parseIssueStreamTokenInput,
  type IssueStreamTokenOutput,
} from '../dto/issue-stream-token-dto';
import { type JwtSigner } from '../ports/jwt-signer';

/**
 * IMPL-401 IssueStreamTokenUseCase (api-specification §4.2)。
 *
 * `POST /sessions` の application logic:
 * 1. 入力 DTO を Zod で検証
 * 2. sessionId / streamTokenId を factory から生成 (ULID)
 * 3. clock() から createdAt を取得し expiresAt = createdAt + tokenTtlSec を合成
 * 4. RelaySession aggregate を生成 (domain invariants の検証)
 * 5. JwtSigner で短命 JWT を署名 (session メタ全てを claims に格納)
 * 6. Output に JWT / relayUrl / 固定 audio パラメータ / 制限値を含めて返却
 *
 * **stateless 設計** (infrastructure-design.md §7 スケーリング方針に対応):
 * Cloud Run 複数インスタンスでも session を参照できるよう、session メタは
 * 中央ストアに保存せず全て JWT claims に格納する。WebSocket 側は JWT を
 * verify するだけで session 情報を復元できる。
 *
 * **本番実装で mock が利用されない設計**:
 * - jwtSigner / clock / sessionIdFactory / streamTokenIdFactory /
 *   relayUrl / tokenTtlSec / limits は全て必須 DI
 * - production entrypoint で jose 署名 / ulid() / 環境変数を明示的に渡す
 */
export type IssueStreamTokenDependencies = Readonly<{
  jwtSigner: JwtSigner;
  clock: () => string;
  sessionIdFactory: () => string;
  streamTokenIdFactory: () => string;
  relayUrl: string;
  tokenTtlSec: number;
  heartbeatIntervalSec: number;
  maxConcurrentSessions: number;
  maxFrameRatePerSecond: number;
}>;

/**
 * UseCase 型。Zod parse は内部で行うため、HTTP layer から渡される `unknown` を
 * そのまま受け取る。拡張側 (extension) は typed DTO を受け取るが、Relay API は
 * route ハンドラから `request.body: unknown` を直接渡すため `unknown` とする。
 */
export type IssueStreamTokenUseCase = (
  input: unknown,
) => ResultAsync<IssueStreamTokenOutput, DomainError>;

const addSecondsIso = (isoDate: string, seconds: number): string => {
  const ms = new Date(isoDate).getTime();
  return new Date(ms + seconds * 1000).toISOString();
};

const toEpochSec = (isoDate: string): number => Math.floor(new Date(isoDate).getTime() / 1000);

/**
 * session メタを JWT claims に落とし込む。WebSocket 側で verify 後、
 * claims からそのまま session 情報を復元できるよう key を正規化する。
 *
 * key の省略形 (3文字以下) を避け、明示的な key 名で可読性を確保する。
 * JWT size は制限されないため短縮より明瞭性を優先する。
 */
const toSessionClaims = (session: RelaySession): Readonly<Record<string, unknown>> => ({
  sourceType: session.sourceType,
  displayName: session.displayName,
  sourceLanguage: session.sourceLanguage,
  autoDetectLanguage: session.autoDetectLanguage,
  targetLanguage: session.targetLanguage,
  overlayTarget: session.overlayTarget,
  client: session.client,
  createdAt: session.createdAt,
});

export const createIssueStreamTokenUseCase = (
  deps: IssueStreamTokenDependencies,
): IssueStreamTokenUseCase => {
  if (deps.tokenTtlSec <= 0) {
    throw new Error('tokenTtlSec must be positive');
  }
  return (rawInput) =>
    parseIssueStreamTokenInput(rawInput).asyncAndThen((input) => {
      const createdAt = deps.clock();
      const expiresAt = addSecondsIso(createdAt, deps.tokenTtlSec);
      const sessionId = deps.sessionIdFactory();
      const streamTokenId = deps.streamTokenIdFactory();

      return createRelaySession({
        sessionIdentifier: sessionId,
        streamTokenIdentifier: streamTokenId,
        sourceType: input.sourceType,
        displayName: input.displayName,
        sourceLanguage: input.sourceLanguage,
        autoDetectLanguage: input.autoDetectLanguage,
        targetLanguage: input.targetLanguage,
        overlayTarget: input.overlayTarget,
        client: input.client,
        createdAt,
        expiresAt,
      }).asyncAndThen((session) =>
        deps.jwtSigner
          .sign({
            jti: session.streamTokenIdentifier,
            sub: session.sessionIdentifier,
            expiresAtEpochSec: toEpochSec(session.expiresAt),
            extraClaims: toSessionClaims(session),
          })
          .map(
            (jwt): IssueStreamTokenOutput => ({
              sessionId: session.sessionIdentifier,
              streamToken: jwt,
              relayUrl: deps.relayUrl,
              expiresAt: session.expiresAt,
              heartbeatIntervalSec: deps.heartbeatIntervalSec,
              audio: {
                encoding: 'pcm_s16le',
                sampleRateHz: 16000,
                channels: 1,
                frameDurationMs: 100,
                transport: 'json-base64',
              },
              limits: {
                maxConcurrentSessions: deps.maxConcurrentSessions,
                maxFrameRatePerSecond: deps.maxFrameRatePerSecond,
              },
            }),
          ),
      );
    });
};
