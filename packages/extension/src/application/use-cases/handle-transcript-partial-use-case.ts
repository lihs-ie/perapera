import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import { createOverlaySettings, type OverlaySettings } from '../../domain/profile/overlay-settings';
import { type TranscriptStreamRepository } from '../../domain/repositories/transcript-stream-repository';
import { parseSegmentIdentifier } from '../../domain/transcript/segment-identifier';
import { createTimestampRange } from '../../domain/transcript/timestamp-range';
import {
  appendPartialTranscriptSegment,
  createTranscriptStream,
  type TranscriptStream,
} from '../../domain/transcript/transcript-stream';
import {
  parseSessionIdentifier,
  type SessionIdentifier,
} from '../../domain/session/session-identifier';
import { describeDomainError, type DomainError } from '../../domain/shared/errors';
import {
  parseHandleTranscriptPartialInput,
  type HandleTranscriptPartialInput,
  type HandleTranscriptPartialOutput,
} from '../dto/handle-transcript-partial-dto';
import { toApplicationError, type ApplicationError } from '../errors/application-errors';
import { type OverlayPresenter } from '../ports/overlay-presenter';
import { type SessionStore } from '../ports/session-store';
import { type SettingsStore } from '../ports/settings-store';
import { projectOverlayRenderModel } from './overlay-render-projector';

export type HandleTranscriptPartialDependencies = Readonly<{
  transcriptStreamRepository: TranscriptStreamRepository;
  overlayPresenter: OverlayPresenter;
  sessionStore: SessionStore;
  settingsStore: SettingsStore;
}>;

export type HandleTranscriptPartialUseCase = (
  input: HandleTranscriptPartialInput,
) => ResultAsync<HandleTranscriptPartialOutput, ApplicationError>;

const logWarn = (scope: string) => (error: DomainError) => {
  console.warn(`[use-case:handle-transcript-partial] ${scope} failed:`, describeDomainError(error));
};

/**
 * 設定ストアから overlay 設定を取得。not-found や失敗時は sensible default に
 * フォールバックする (ホットパスで stuck しない)。
 */
/**
 * Repository が not-found の場合は session に紐づく空の TranscriptStream を
 * 作成して返す。IndexedDB は append-only のため findBySessionId で 0 row なら
 * NotFoundError が返るが、これは「まだ transcript 未着」の意味で、使い手
 * (handle use case) にとっては**正常な初回 state**。空集約を合成して続行する
 * ことで、start session 時に pre-create しなくてよくなる (append-only の
 * spirit を維持)。
 */
const findOrCreateTranscriptStream = (
  repository: TranscriptStreamRepository,
  sessionIdentifier: SessionIdentifier,
): ResultAsync<TranscriptStream, DomainError> =>
  repository
    .findBySessionId(sessionIdentifier)
    .orElse((error): ResultAsync<TranscriptStream, DomainError> => {
      if (error.kind === 'not-found' && error.resourceType === 'TranscriptStream') {
        const created = createTranscriptStream({ sessionIdentifier });
        return created.isOk() ? okAsync(created.value) : errAsync(created.error);
      }
      return errAsync(error);
    });

const resolveOverlaySettings = (
  settingsStore: SettingsStore,
): ResultAsync<OverlaySettings, DomainError> =>
  settingsStore.getDefaultOverlaySettings().orElse(() => {
    const fallback = createOverlaySettings({
      positionPreset: 'bottom',
      opacity: 0.8,
      maxLines: 2,
      fontScale: 1,
      showOriginalText: true,
      showTranslatedText: true,
    });
    return fallback.isOk() ? okAsync(fallback.value) : okAsync(fallback._unsafeUnwrap());
  });

/**
 * IMPL-213 HandleTranscriptPartialUseCase (DD-304)。
 * ホットパス: Relay `transcript.partial` 受信 → domain update → storage append
 * (hot) → overlay render → session store 永続化 (fire-and-forget)。
 *
 * 結果整合性: `overlayPresenter.render` の Err は WARN ログに留め、UseCase
 * 自体は成功を返す (use-case.md §6.2)。`sessionStore.appendTranscript` は
 * fire-and-forget で発火。
 */
export const createHandleTranscriptPartialUseCase = (
  deps: HandleTranscriptPartialDependencies,
): HandleTranscriptPartialUseCase => {
  return (input) =>
    parseHandleTranscriptPartialInput(input)
      .asyncAndThen((parsed) =>
        parseSessionIdentifier(parsed.sessionId).asyncAndThen((sessionIdentifier) =>
          parseSegmentIdentifier(parsed.segmentId).asyncAndThen((segmentIdentifier) =>
            createTimestampRange({
              startMs: parsed.timeRange.startMs,
              endMs: parsed.timeRange.endMs,
            }).asyncAndThen((timeRange) =>
              findOrCreateTranscriptStream(deps.transcriptStreamRepository, sessionIdentifier)
                .andThen((stream) =>
                  appendPartialTranscriptSegment(stream, {
                    segmentIdentifier,
                    revision: parsed.revision,
                    text: parsed.text,
                    timeRange,
                  }),
                )
                .andThen((updatedStream) => {
                  const segment = updatedStream.segments.get(segmentIdentifier);
                  if (segment === undefined) {
                    return okAsync({ updatedStream, segment: null });
                  }
                  return deps.transcriptStreamRepository
                    .appendPartial(sessionIdentifier, segment)
                    .map(() => ({ updatedStream, segment }));
                })
                .andThen(({ updatedStream, segment }) =>
                  resolveOverlaySettings(deps.settingsStore).map((settings) => {
                    const renderModel = projectOverlayRenderModel({
                      stream: updatedStream,
                      settings,
                    });
                    // render failure is swallowed (hot-path not rolled back)
                    void deps.overlayPresenter
                      .render(renderModel)
                      .match(() => undefined, logWarn('overlayPresenter.render'));
                    // persistence is fire-and-forget (結果整合性)
                    if (segment !== null) {
                      void deps.sessionStore
                        .appendTranscript(sessionIdentifier, segment)
                        .match(() => undefined, logWarn('sessionStore.appendTranscript'));
                    }
                    const output: HandleTranscriptPartialOutput = {
                      sessionId: sessionIdentifier,
                      segmentId: segmentIdentifier,
                      revision: parsed.revision,
                      renderModel,
                    };
                    return output;
                  }),
                ),
            ),
          ),
        ),
      )
      .mapErr(toApplicationError);
};
