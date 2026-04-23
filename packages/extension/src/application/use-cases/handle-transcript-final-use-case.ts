import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import { createOverlaySettings, type OverlaySettings } from '../../domain/profile/overlay-settings';
import { type TranscriptStreamRepository } from '../../domain/repositories/transcript-stream-repository';
import { parseSegmentIdentifier } from '../../domain/transcript/segment-identifier';
import { createTimestampRange } from '../../domain/transcript/timestamp-range';
import {
  attachTranslationToSegment,
  createTranscriptStream,
  finalizeSegment,
  type TranscriptStream,
} from '../../domain/transcript/transcript-stream';
import {
  parseSessionIdentifier,
  type SessionIdentifier,
} from '../../domain/session/session-identifier';
import { describeDomainError, type DomainError } from '../../domain/shared/errors';
import {
  parseHandleTranscriptFinalInput,
  type HandleTranscriptFinalInput,
  type HandleTranscriptFinalOutput,
} from '../dto/handle-transcript-final-dto';
import { toApplicationError, type ApplicationError } from '../errors/application-errors';
import { type OverlayPresenter } from '../ports/overlay-presenter';
import { type SessionStore } from '../ports/session-store';
import { type SettingsStore } from '../ports/settings-store';
import { projectOverlayRenderModel } from './overlay-render-projector';

export type HandleTranscriptFinalDependencies = Readonly<{
  transcriptStreamRepository: TranscriptStreamRepository;
  overlayPresenter: OverlayPresenter;
  sessionStore: SessionStore;
  settingsStore: SettingsStore;
  translationIdFactory: () => string;
}>;

export type HandleTranscriptFinalUseCase = (
  input: HandleTranscriptFinalInput,
) => ResultAsync<HandleTranscriptFinalOutput, ApplicationError>;

const logWarn = (scope: string) => (error: DomainError) => {
  console.warn(`[use-case:handle-transcript-final] ${scope} failed:`, describeDomainError(error));
};

/**
 * Repository not-found を空 TranscriptStream に合成 (handle-transcript-partial
 * と同じパターン)。session.final は partial の後に来る想定だが、partial が
 * repo に persist される前 (非同期) に final が来る race を防ぐためここでも
 * 空 fallback を採用する。
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

const determineTranslationStatus = (
  translation: HandleTranscriptFinalInput['translation'],
): HandleTranscriptFinalOutput['translationStatus'] => {
  if (translation === undefined) return 'pending';
  return translation.status;
};

/**
 * IMPL-214 HandleTranscriptFinalUseCase (DD-305)。
 *
 * 流れ:
 * 1. `findBySessionId` → `finalizeSegment` (partial → final に遷移)
 * 2. `translation.status === 'completed'` なら `attachTranslationToSegment`
 *    (failed は Err 的な扱い、stream に attach せず status だけ反映)
 * 3. `appendFinal` + (completed 時のみ) `appendTranslation` (hot-path I/O)
 * 4. overlay render (結果整合、失敗しても Ok)
 * 5. session store は fire-and-forget
 */
export const createHandleTranscriptFinalUseCase = (
  deps: HandleTranscriptFinalDependencies,
): HandleTranscriptFinalUseCase => {
  return (input) =>
    parseHandleTranscriptFinalInput(input)
      .asyncAndThen((parsed) =>
        parseSessionIdentifier(parsed.sessionId).asyncAndThen((sessionIdentifier) =>
          parseSegmentIdentifier(parsed.segmentId).asyncAndThen((segmentIdentifier) =>
            createTimestampRange({
              startMs: parsed.timeRange.startMs,
              endMs: parsed.timeRange.endMs,
            }).asyncAndThen((timeRange) =>
              findOrCreateTranscriptStream(deps.transcriptStreamRepository, sessionIdentifier)
                .andThen((stream): ResultAsync<TranscriptStream, DomainError> => {
                  // `translation.final` 受信時は session-command-service 経由で
                  // text='' + translation 付きの input が渡される。既に別経路で
                  // 同 segment が final 化されている想定なので finalizeSegment を
                  // skip して、後続 andThen の attachTranslationToSegment へ流す。
                  if (parsed.text.length === 0) {
                    return okAsync(stream);
                  }
                  const finalized = finalizeSegment(stream, {
                    segmentIdentifier,
                    text: parsed.text,
                    timeRange,
                  });
                  return finalized.isOk() ? okAsync(finalized.value) : errAsync(finalized.error);
                })
                .andThen((finalizedStream): ResultAsync<TranscriptStream, DomainError> => {
                  if (parsed.translation?.status === 'completed') {
                    return attachTranslationToSegment(finalizedStream, {
                      translationIdentifier: deps.translationIdFactory(),
                      segmentIdentifier,
                      targetLanguage: parsed.translation.targetLanguage,
                      text: parsed.translation.text,
                    }).asyncMap((stream) => Promise.resolve(stream));
                  }
                  return okAsync(finalizedStream);
                })
                .andThen((streamAfterTranslation) => {
                  const segment = streamAfterTranslation.segments.get(segmentIdentifier);
                  if (segment === undefined) {
                    return okAsync({ stream: streamAfterTranslation, segment: null });
                  }
                  return deps.transcriptStreamRepository
                    .appendFinal(sessionIdentifier, segment)
                    .andThen(() => {
                      const translation =
                        streamAfterTranslation.translations.get(segmentIdentifier);
                      if (translation === undefined) {
                        return okAsync({ stream: streamAfterTranslation, segment });
                      }
                      return deps.transcriptStreamRepository
                        .appendTranslation(sessionIdentifier, translation)
                        .map(() => ({ stream: streamAfterTranslation, segment }));
                    });
                })
                .andThen(({ stream, segment }) =>
                  resolveOverlaySettings(deps.settingsStore).map((settings) => {
                    const renderModel = projectOverlayRenderModel({ stream, settings });
                    void deps.overlayPresenter
                      .render(renderModel)
                      .match(() => undefined, logWarn('overlayPresenter.render'));
                    if (segment !== null) {
                      void deps.sessionStore
                        .appendTranscript(sessionIdentifier, segment)
                        .match(() => undefined, logWarn('sessionStore.appendTranscript'));
                      const translation = stream.translations.get(segmentIdentifier);
                      if (translation !== undefined) {
                        void deps.sessionStore
                          .appendTranslation(sessionIdentifier, translation)
                          .match(() => undefined, logWarn('sessionStore.appendTranslation'));
                      }
                    }
                    const output: HandleTranscriptFinalOutput = {
                      sessionId: sessionIdentifier,
                      segmentId: segmentIdentifier,
                      translationStatus: determineTranslationStatus(parsed.translation),
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
