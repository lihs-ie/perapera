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
import { type AudioFramePump } from '../services/audio-frame-pump';
import { type CaptureOrchestrator } from '../services/capture-orchestrator';
import { type RelaySessionSubscriber } from '../services/relay-session-subscriber';

export type StopSourceSessionDependencies = Readonly<{
  sourceSessionRepository: SourceSessionRepository;
  relayGateway: RelayGateway;
  overlayPresenter: OverlayPresenter;
  captureOrchestrator: CaptureOrchestrator;
  relaySessionSubscriber: RelaySessionSubscriber;
  audioFramePump: AudioFramePump;
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
 * アクティブなセッションを停止し、Relay 接続 / capture / overlay / subscribe を
 * 解放する。`closeSession` / `unmount` / `captureOrchestrator.disconnect` /
 * `relaySessionSubscriber.stop` は fire-and-forget で結果整合性を優先
 * (use-case.md §6.1)。
 *
 * IMPL-600 (Phase 5 integration): capture 切断と relay subscribe 解除を
 * stop フェーズで並列実行し、session 停止後に relay イベントが subscriber を
 * 経由して UseCase に流れないようにする。
 *
 * IMPL-602 (audio frame pipeline): `audioFramePump.stop` を同期で先に呼び、
 * `captureOrchestrator.disconnect` が frameChannel.close() する前に drain を
 * abort させ、stop 後に sendAudioFrame が呼ばれない不変条件を維持する。
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
              // relay subscribe 解除は同期 (throw しても listener は残らない想定)
              try {
                deps.relaySessionSubscriber.stop(sessionIdentifier);
              } catch (cause) {
                console.warn(
                  `[use-case:stop-source-session] relay-session-subscriber.stop threw:`,
                  cause,
                );
              }
              // audio-frame-pump は同期 abort (drain は AbortSignal で抜ける)
              try {
                deps.audioFramePump.stop(sessionIdentifier);
              } catch (cause) {
                console.warn(`[use-case:stop-source-session] audio-frame-pump.stop threw:`, cause);
              }
              // 下記 3 つは fire-and-forget (UseCase 自体は成功を返す)
              void deps.relayGateway
                .closeSession(sessionIdentifier)
                .match(() => undefined, logWarn('closeSession'));
              void deps.captureOrchestrator
                .disconnect(sessionIdentifier)
                .match(() => undefined, logWarn('captureOrchestrator.disconnect'));
              void deps.overlayPresenter
                .unmount(sessionIdentifier)
                .match(() => undefined, logWarn('overlayPresenter.unmount'));
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
