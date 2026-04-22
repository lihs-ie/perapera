import { errAsync, ResultAsync } from 'neverthrow';
import { type ExtensionProfileRepository } from '../../domain/repositories/extension-profile-repository';
import { type SourceSessionRepository } from '../../domain/repositories/source-session-repository';
import { validateSessionConcurrency } from '../../domain/services/session-concurrency-policy';
import { createLanguagePair } from '../../domain/session/language-pair';
import {
  createSourceSession,
  startSourceSession,
  transitionSourceSessionState,
  type SourceSession,
} from '../../domain/session/source-session';
import { type DomainError } from '../../domain/shared/errors';
import {
  parseStartSourceSessionInput,
  type StartSourceSessionInput,
  type StartSourceSessionOutput,
} from '../dto/start-source-session-dto';
import {
  permissionRequiredAppError,
  toApplicationError,
  type ApplicationError,
} from '../errors/application-errors';
import { type PermissionCoordinator } from '../ports/permission-coordinator';
import { type RelayGateway } from '../ports/relay-gateway';
import { type StartSourceCommand } from '../ports/source-adapter';
import { type CaptureOrchestrator } from '../services/capture-orchestrator';
import { type RelaySessionSubscriber } from '../services/relay-session-subscriber';

export type StartSourceSessionDependencies = Readonly<{
  sourceSessionRepository: SourceSessionRepository;
  extensionProfileRepository: ExtensionProfileRepository;
  relayGateway: RelayGateway;
  permissionCoordinator: PermissionCoordinator;
  captureOrchestrator: CaptureOrchestrator;
  relaySessionSubscriber: RelaySessionSubscriber;
  clock: () => string;
  idFactory: Readonly<{
    session: () => string;
    source: () => string;
  }>;
}>;

export type StartSourceSessionUseCase = (
  input: StartSourceSessionInput,
) => ResultAsync<StartSourceSessionOutput, ApplicationError>;

type ChainError = DomainError | ApplicationError;

/**
 * DomainError | ApplicationError のどちらが来ても ApplicationError に変換する。
 * ApplicationError はそのまま通し、DomainError は `toApplicationError` で変換。
 */
const normalizeChainError = (error: ChainError): ApplicationError => {
  if ('type' in error) return error;
  return toApplicationError(error);
};

const toStartSourceCommand = (session: SourceSession): StartSourceCommand => {
  switch (session.sourceType) {
    case 'tab':
      return { sourceType: 'tab', sessionIdentifier: session.sessionIdentifier };
    case 'microphone':
      return { sourceType: 'microphone', sessionIdentifier: session.sessionIdentifier };
    case 'desktop':
      return { sourceType: 'desktop', sessionIdentifier: session.sessionIdentifier };
  }
};

/**
 * IMPL-210 StartSourceSessionUseCase (DD-301)。
 *
 * シーケンス:
 * 1. `findActiveSessions` + `validateSessionConcurrency` (上限 3 未満)
 * 2. `extensionProfileRepository.getDefault` で default 言語ペア取得
 * 3. `createLanguagePair` で有効言語決定 (input 優先、fallback profile.default)
 * 4. `createSourceSession` → `startSourceSession` (idle → requesting_permission)
 * 5. `save` (1st: requesting_permission state)
 * 6. `permissionCoordinator.requestFor` → granted / denied 分岐
 *    - granted: `transitionSourceSessionState('connecting')` →
 *      `captureOrchestrator.connect` → `relayGateway.openSession` →
 *      `relaySessionSubscriber.start(sessionId)` → `save` (2nd)
 *    - denied: `transitionSourceSessionState('error')` → `save` (2nd) →
 *      errAsync(permissionRequiredAppError)
 * 7. 出力 DTO: `{ sessionId, state, startedAt }`
 *
 * IMPL-600 (Phase 5 integration): capture 接続と relay subscribe を
 * connect フェーズで配線し、以降の `RelayEvent` (transcript / translation) が
 * `SessionCommandService.handleRelayEvent` に流れるようにする。
 */
export const createStartSourceSessionUseCase = (
  deps: StartSourceSessionDependencies,
): StartSourceSessionUseCase => {
  return (input) => {
    const resultChain: ResultAsync<SourceSession, ChainError> = parseStartSourceSessionInput(
      input,
    ).asyncAndThen((parsed) =>
      deps.sourceSessionRepository.findActiveSessions().andThen((active) =>
        validateSessionConcurrency(active).asyncAndThen(() =>
          deps.extensionProfileRepository.getDefault().andThen((profile) => {
            const sourceLang = parsed.sourceLanguage ?? profile.defaultLanguagePair.source;
            return createLanguagePair({
              source: sourceLang,
              target: parsed.targetLanguage,
            })
              .andThen((languagePair) =>
                createSourceSession({
                  sessionIdentifier: deps.idFactory.session(),
                  sourceIdentifier: deps.idFactory.source(),
                  sourceType: parsed.sourceType,
                  languagePair,
                  startedAt: deps.clock(),
                }),
              )
              .andThen((idleSession) => startSourceSession(idleSession))
              .asyncAndThen((requesting) =>
                deps.sourceSessionRepository.save(requesting).map(() => requesting),
              )
              .andThen(
                (savedSession): ResultAsync<SourceSession, ChainError> =>
                  deps.permissionCoordinator
                    .requestFor(parsed.sourceType)
                    .andThen((grant): ResultAsync<SourceSession, ChainError> => {
                      if (grant.status === 'granted') {
                        return transitionSourceSessionState(
                          savedSession,
                          'connecting',
                        ).asyncAndThen((connecting) =>
                          deps.captureOrchestrator
                            .connect(toStartSourceCommand(connecting))
                            .andThen(() => deps.relayGateway.openSession(connecting))
                            .andThen(() => {
                              deps.relaySessionSubscriber.start(connecting.sessionIdentifier);
                              return deps.sourceSessionRepository
                                .save(connecting)
                                .map(() => connecting);
                            }),
                        );
                      }
                      return transitionSourceSessionState(savedSession, 'error').asyncAndThen(
                        (errorSession) =>
                          deps.sourceSessionRepository.save(errorSession).andThen(() =>
                            errAsync<SourceSession, ChainError>(
                              permissionRequiredAppError({
                                sourceType: grant.sourceType,
                                message:
                                  grant.reason ?? `permission denied for ${grant.sourceType}`,
                              }),
                            ),
                          ),
                      );
                    }),
              );
          }),
        ),
      ),
    );
    return resultChain
      .map(
        (session): StartSourceSessionOutput => ({
          sessionId: session.sessionIdentifier,
          state: session.state,
          startedAt: session.startedAt,
        }),
      )
      .mapErr(normalizeChainError);
  };
};
