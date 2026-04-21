import { type ResultAsync } from 'neverthrow';
import { type SourceSessionRepository } from '../../domain/repositories/source-session-repository';
import { parseSessionIdentifier } from '../../domain/session/session-identifier';
import { stopSourceSession } from '../../domain/session/source-session';
import { describeDomainError, type DomainError } from '../../domain/shared/errors';
import {
  parseStopSourceSessionInput,
  type StopSourceSessionInput,
  type StopSourceSessionOutput,
} from '../dto/stop-source-session-dto';
import { toApplicationError, type ApplicationError } from '../errors/application-errors';
import { type OverlayPresenter } from '../ports/overlay-presenter';
import { type RelayGateway } from '../ports/relay-gateway';

export type StopSourceSessionDependencies = Readonly<{
  sourceSessionRepository: SourceSessionRepository;
  relayGateway: RelayGateway;
  overlayPresenter: OverlayPresenter;
  clock: () => string;
}>;

export type StopSourceSessionUseCase = (
  input: StopSourceSessionInput,
) => ResultAsync<StopSourceSessionOutput, ApplicationError>;

const logWarn =
  (scope: string) =>
  (error: DomainError): void => {
    console.warn(`[use-case:stop-source-session] ${scope} failed:`, describeDomainError(error));
  };

/**
 * IMPL-215 StopSourceSessionUseCase (DD-306)。
 *
 * アクティブなセッションを停止し、Relay 接続とオーバーレイを解放する。
 * `closeSession` / `unmount` は fire-and-forget (失敗しても UseCase は成功を
 * 返す) で、結果整合性を優先する (use-case.md §6.1)。
 */
export const createStopSourceSessionUseCase = (
  deps: StopSourceSessionDependencies,
): StopSourceSessionUseCase => {
  return (input) =>
    parseStopSourceSessionInput(input)
      .asyncAndThen((parsed) =>
        parseSessionIdentifier(parsed.sessionId).asyncAndThen((sessionIdentifier) =>
          deps.sourceSessionRepository
            .findById(sessionIdentifier)
            .andThen((session) => stopSourceSession(session, { stoppedAt: deps.clock() }))
            .andThen((stopped) => deps.sourceSessionRepository.save(stopped).map(() => stopped))
            .map((stopped): StopSourceSessionOutput => {
              void deps.relayGateway
                .closeSession(sessionIdentifier)
                .match(() => undefined, logWarn('closeSession'));
              void deps.overlayPresenter
                .unmount(sessionIdentifier)
                .match(() => undefined, logWarn('unmount'));
              return {
                sessionId: stopped.sessionIdentifier,
                state: stopped.state,
                stoppedAt: stopped.stoppedAt ?? deps.clock(),
              };
            }),
        ),
      )
      .mapErr(toApplicationError);
};
