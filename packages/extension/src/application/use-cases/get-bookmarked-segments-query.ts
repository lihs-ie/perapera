import { type ResultAsync } from 'neverthrow';
import { type TranscriptStreamRepository } from '../../domain/repositories/transcript-stream-repository';
import { toApplicationError, type ApplicationError } from '../errors/application-errors';

export type GetBookmarkedSegmentsOutput = Readonly<{
  bookmarks: readonly {
    sessionIdentifier: string;
    segmentIdentifier: string;
    snippet: string;
    startTimeMs: number;
  }[];
}>;

export type GetBookmarkedSegmentsDependencies = Readonly<{
  transcriptStreamRepository: TranscriptStreamRepository;
}>;

export type GetBookmarkedSegmentsQuery = () => ResultAsync<
  GetBookmarkedSegmentsOutput,
  ApplicationError
>;

/**
 * IMPL-220 GetBookmarkedSegmentsQuery (DD-221, Issue #126)。
 *
 * 全 session 横断で isBookmarked=true な final 字幕を取得する。idle 画面の
 * 「ブックマーク」タブ表示に使う。
 */
export const createGetBookmarkedSegmentsQuery = (
  deps: GetBookmarkedSegmentsDependencies,
): GetBookmarkedSegmentsQuery => {
  return () =>
    deps.transcriptStreamRepository
      .findBookmarked()
      .map(
        (matches): GetBookmarkedSegmentsOutput => ({
          bookmarks: matches.map((m) => ({
            sessionIdentifier: m.sessionIdentifier,
            segmentIdentifier: m.segmentIdentifier,
            snippet: m.snippet,
            startTimeMs: m.startTimeMs,
          })),
        }),
      )
      .mapErr(toApplicationError);
};
