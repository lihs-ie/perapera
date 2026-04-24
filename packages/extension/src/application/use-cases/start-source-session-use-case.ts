import { errAsync, okAsync, ResultAsync } from 'neverthrow';
import { createGlossary, EMPTY_GLOSSARY, type Glossary } from '../../domain/glossary';
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
import { describeDomainError, type DomainError } from '../../domain/shared/errors';
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
import { type SettingsStore } from '../ports/settings-store';
import { type StartSourceCommand } from '../ports/source-adapter';
import { type TabStreamIdResolver } from '../ports/tab-stream-id-resolver';
import { type AudioFramePump } from '../services/audio-frame-pump';
import { type CaptureOrchestrator } from '../services/capture-orchestrator';
import { type OffscreenCommandSender } from '../services/offscreen-command-sender';
import { type RelaySessionSubscriber } from '../services/relay-session-subscriber';

export type StartSourceSessionDependencies = Readonly<{
  sourceSessionRepository: SourceSessionRepository;
  extensionProfileRepository: ExtensionProfileRepository;
  relayGateway: RelayGateway;
  permissionCoordinator: PermissionCoordinator;
  captureOrchestrator: CaptureOrchestrator;
  relaySessionSubscriber: RelaySessionSubscriber;
  audioFramePump: AudioFramePump;
  offscreenCommandSender: OffscreenCommandSender;
  /**
   * Optional。指定すると tab source の granted path で
   * `chrome.tabCapture.getMediaStreamId` 由来の streamId を解決し、
   * offscreen audio.open command の tabStreamId として渡す (IMPL-613)。
   * 未指定の場合は streamId なしで送信 (Step 2b-2b の tabStreamApi 未注入時と同様)。
   */
  tabStreamIdResolver?: TabStreamIdResolver;
  /**
   * Optional。指定すると session start 時に glossary snapshot を読み取り、
   * `input.glossary` が未指定なら defaultGlossary を適用する (DD-238 / issue #123)。
   * 未指定の場合は `input.glossary` のみを使用 (未指定なら EMPTY_GLOSSARY)。
   */
  settingsStore?: SettingsStore;
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

/**
 * input.glossary が指定されていればそれを採用、無ければ SettingsStore の
 * defaultGlossary を取得、どちらも無ければ EMPTY_GLOSSARY を返す。
 * SettingsStore 側で not-found や I/O 失敗が起きても session start は続行する
 * (glossary は空で開始、ログに warn)。
 */
const resolveGlossary = (
  deps: StartSourceSessionDependencies,
  inputGlossary:
    | {
        entries: readonly { source: string; target: string; caseSensitive: boolean }[];
      }
    | undefined,
): ResultAsync<Glossary, DomainError> => {
  if (inputGlossary !== undefined) {
    const createResult = createGlossary({ entries: inputGlossary.entries });
    if (createResult.isErr()) return errAsync<Glossary, DomainError>(createResult.error);
    return okAsync<Glossary, DomainError>(createResult.value);
  }
  if (deps.settingsStore === undefined) {
    return okAsync<Glossary, DomainError>(EMPTY_GLOSSARY);
  }
  return deps.settingsStore.getDefaultGlossary().orElse((error) => {
    if (error.kind !== 'not-found') {
      console.warn(
        `[use-case:start-source-session] failed to load defaultGlossary (continuing with empty): ${describeDomainError(
          error,
        )}`,
      );
    }
    return okAsync<Glossary, DomainError>(EMPTY_GLOSSARY);
  });
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
 *
 * IMPL-602 (audio frame pipeline): `captureOrchestrator.connect` が返す
 * `ActiveCapture.frameChannel` を `audioFramePump.start` に引き渡し、以降
 * 100ms PCM16 フレームが `relayGateway.sendAudioFrame` へ自動 drain される。
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
            return resolveGlossary(deps, parsed.glossary).andThen((glossary) =>
              createLanguagePair({
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
                    glossary,
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
                              .andThen((activeCapture) =>
                                deps.relayGateway.openSession(connecting).map(() => activeCapture),
                              )
                              .andThen((activeCapture) => {
                                // tab source の overlayTarget.tabId を capture 対象 tab として利用。
                                // MV3 では `chrome.tabCapture.getMediaStreamId({targetTabId})` で
                                // 取得した streamId を offscreen に渡し、offscreen 側が
                                // `getUserMedia` で MediaStream を確保する (IMPL-611/612)。
                                const targetTabId =
                                  parsed.sourceType === 'tab' &&
                                  parsed.overlayTarget.kind === 'tab' &&
                                  parsed.overlayTarget.tabId !== undefined
                                    ? parsed.overlayTarget.tabId
                                    : undefined;
                                console.log(
                                  '[use-case:start-source-session] tab-stream-id chain preconditions',
                                  {
                                    sourceType: parsed.sourceType,
                                    overlayTargetKind: parsed.overlayTarget.kind,
                                    targetTabId,
                                    hasResolver: deps.tabStreamIdResolver !== undefined,
                                  },
                                );
                                const tabStreamIdChain: ResultAsync<
                                  string | undefined,
                                  ChainError
                                > =
                                  targetTabId !== undefined &&
                                  deps.tabStreamIdResolver !== undefined
                                    ? deps.tabStreamIdResolver
                                        .resolve(targetTabId)
                                        .map((streamId): string | undefined => {
                                          console.log(
                                            `[use-case:start-source-session] tab-stream-id resolved for tab ${String(
                                              targetTabId,
                                            )} → ${streamId.slice(0, 8)}...`,
                                          );
                                          return streamId;
                                        })
                                        .orElse(
                                          (error): ResultAsync<string | undefined, ChainError> => {
                                            console.warn(
                                              `[use-case:start-source-session] tab-stream-id resolve failed (continuing without streamId): ${describeDomainError(
                                                error,
                                              )}`,
                                            );
                                            return okAsync<string | undefined, ChainError>(
                                              undefined,
                                            );
                                          },
                                        )
                                    : (() => {
                                        console.warn(
                                          '[use-case:start-source-session] tab-stream-id chain skipped; audio frames will NOT flow',
                                        );
                                        return okAsync<string | undefined, ChainError>(undefined);
                                      })();
                                return tabStreamIdChain.andThen((tabStreamId) => {
                                  console.log(
                                    `[use-case:start-source-session] offscreen.openAudioContext (tabStreamId=${
                                      tabStreamId !== undefined ? 'present' : 'absent'
                                    })`,
                                  );
                                  return deps.offscreenCommandSender
                                    .openAudioContext(
                                      connecting.sessionIdentifier,
                                      tabStreamId !== undefined ? { tabStreamId } : undefined,
                                    )
                                    .map(() => activeCapture);
                                });
                              })
                              .andThen((activeCapture) => {
                                deps.audioFramePump.start(
                                  connecting.sessionIdentifier,
                                  activeCapture.frameChannel,
                                  (frame) => deps.relayGateway.sendAudioFrame(frame),
                                );
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
                ),
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
