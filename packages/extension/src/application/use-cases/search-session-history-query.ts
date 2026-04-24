import { type ResultAsync } from 'neverthrow';
import {
  type TranscriptSearchMatch,
  type TranscriptStreamRepository,
} from '../../domain/repositories/transcript-stream-repository';
import { createTranscriptSearchQuery } from '../../domain/search';
import { toApplicationError, type ApplicationError } from '../errors/application-errors';

export type SearchSessionHistoryInput = Readonly<{
  keyword: string;
  language: 'source' | 'target' | 'both';
  caseSensitive: boolean;
}>;

export type SearchSessionHistorySessionGroup = Readonly<{
  sessionIdentifier: string;
  matches: readonly {
    segmentIdentifier: string;
    snippet: string;
    matchedLanguage: 'source' | 'target';
    startTimeMs: number;
  }[];
}>;

export type SearchSessionHistoryOutput = Readonly<{
  sessions: readonly SearchSessionHistorySessionGroup[];
}>;

export type SearchSessionHistoryDependencies = Readonly<{
  transcriptStreamRepository: TranscriptStreamRepository;
}>;

export type SearchSessionHistoryQuery = (
  input: SearchSessionHistoryInput,
) => ResultAsync<SearchSessionHistoryOutput, ApplicationError>;

const MAX_MATCHES_PER_SESSION = 5 as const;

const groupBySession = (
  matches: readonly TranscriptSearchMatch[],
): readonly SearchSessionHistorySessionGroup[] => {
  const buckets = new Map<string, TranscriptSearchMatch[]>();
  for (const match of matches) {
    const key = match.sessionIdentifier;
    const bucket = buckets.get(key);
    if (bucket === undefined) {
      buckets.set(key, [match]);
    } else {
      bucket.push(match);
    }
  }
  return [...buckets.entries()].map(([sessionIdentifier, items]) => {
    const sorted = [...items].sort((a, b) => a.startTimeMs - b.startTimeMs);
    return {
      sessionIdentifier,
      matches: sorted.slice(0, MAX_MATCHES_PER_SESSION).map((match) => ({
        segmentIdentifier: match.segmentIdentifier,
        snippet: match.snippet,
        matchedLanguage: match.matchedLanguage,
        startTimeMs: match.startTimeMs,
      })),
    };
  });
};

/**
 * IMPL-218 SearchSessionHistoryQuery (DD-261, Issue #125)。
 *
 * セッション履歴画面の全文検索。`TranscriptStreamRepository.search` で
 * transcript / translation を linear scan し、session 単位にグループ化して
 * 各 session 最大 5 match に絞る (UI 表示安定性のため)。
 */
export const createSearchSessionHistoryQuery = (
  deps: SearchSessionHistoryDependencies,
): SearchSessionHistoryQuery => {
  return (input) =>
    createTranscriptSearchQuery(input)
      .asyncAndThen((query) => deps.transcriptStreamRepository.search(query))
      .map((matches): SearchSessionHistoryOutput => ({ sessions: groupBySession(matches) }))
      .mapErr(toApplicationError);
};
