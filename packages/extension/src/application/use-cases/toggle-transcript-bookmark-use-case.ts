import { type ResultAsync } from 'neverthrow';
import { type TranscriptStreamRepository } from '../../domain/repositories/transcript-stream-repository';
import { parseSessionIdentifier } from '../../domain/session/session-identifier';
import { toApplicationError, type ApplicationError } from '../errors/application-errors';

export type ToggleTranscriptBookmarkInput = Readonly<{
  sessionId: string;
  segmentId: string;
}>;

export type ToggleTranscriptBookmarkOutput = Readonly<{
  sessionId: string;
  segmentId: string;
}>;

export type ToggleTranscriptBookmarkDependencies = Readonly<{
  transcriptStreamRepository: TranscriptStreamRepository;
}>;

export type ToggleTranscriptBookmarkUseCase = (
  input: ToggleTranscriptBookmarkInput,
) => ResultAsync<ToggleTranscriptBookmarkOutput, ApplicationError>;

/**
 * IMPL-219 ToggleTranscriptBookmarkUseCase (DD-221, Issue #126)。
 *
 * final 字幕のブックマーク状態をトグルする。partial 字幕には invariant-violation。
 */
export const createToggleTranscriptBookmarkUseCase = (
  deps: ToggleTranscriptBookmarkDependencies,
): ToggleTranscriptBookmarkUseCase => {
  return (input) =>
    parseSessionIdentifier(input.sessionId)
      .asyncAndThen((sessionIdentifier) =>
        deps.transcriptStreamRepository.toggleBookmark(sessionIdentifier, input.segmentId).map(
          (): ToggleTranscriptBookmarkOutput => ({
            sessionId: input.sessionId,
            segmentId: input.segmentId,
          }),
        ),
      )
      .mapErr(toApplicationError);
};
