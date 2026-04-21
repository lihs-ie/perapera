import { type ResultAsync } from 'neverthrow';
import { createRelaySession } from '../../domain/session/relay-session';
import { type DomainError } from '../../domain/shared/errors';
import {
  parseIssueStreamTokenInput,
  type IssueStreamTokenInput,
  type IssueStreamTokenOutput,
} from '../dto/issue-stream-token-dto';
import { type JwtSigner } from '../ports/jwt-signer';
import { type RelaySessionRepository } from '../ports/session-repository';

/**
 * IMPL-401 IssueStreamTokenUseCase (api-specification §4.2)。
 *
 * `POST /sessions` の application logic:
 * 1. 入力 DTO を Zod で検証
 * 2. sessionId / streamTokenId を factory から生成 (ULID)
 * 3. clock() から createdAt を取得し expiresAt = createdAt + tokenTtlSec を合成
 * 4. RelaySession aggregate を生成 (domain invariants の検証)
 * 5. JwtSigner で短命 JWT を署名 (jti=streamTokenId, sub=sessionId, exp=...)
 * 6. RelaySessionRepository へ save
 * 7. Output に JWT / relayUrl / 固定 audio パラメータ / 制限値を含めて返却
 *
 * **本番実装で mock が利用されない設計**:
 * - jwtSigner / sessionRepository / clock / sessionIdFactory /
 *   streamTokenIdFactory / relayUrl / tokenTtlSec は全て必須 DI
 * - production entrypoint で jose 署名 / in-memory repo / ulid() / 環境変数
 *   を明示的に渡す
 */
export type IssueStreamTokenDependencies = Readonly<{
  jwtSigner: JwtSigner;
  sessionRepository: RelaySessionRepository;
  clock: () => string;
  sessionIdFactory: () => string;
  streamTokenIdFactory: () => string;
  relayUrl: string;
  tokenTtlSec: number;
  heartbeatIntervalSec: number;
  maxConcurrentSessions: number;
  maxFrameRatePerSecond: number;
}>;

export type IssueStreamTokenUseCase = (
  input: IssueStreamTokenInput,
) => ResultAsync<IssueStreamTokenOutput, DomainError>;

const addSecondsIso = (isoDate: string, seconds: number): string => {
  const ms = new Date(isoDate).getTime();
  return new Date(ms + seconds * 1000).toISOString();
};

const toEpochSec = (isoDate: string): number => Math.floor(new Date(isoDate).getTime() / 1000);

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
          })
          .andThen((jwt) =>
            deps.sessionRepository.save(session).map(
              (): IssueStreamTokenOutput => ({
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
          ),
      );
    });
};
