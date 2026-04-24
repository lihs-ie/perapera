import { type ResultAsync } from 'neverthrow';
import { type SourceSessionRepository } from '../../domain/repositories/source-session-repository';
import { type SourceSession } from '../../domain/session/source-session';
import {
  parseGetSessionHistoryInput,
  type GetSessionHistoryInput,
  type SessionHistorySummary,
  type SessionHistorySummaryListOutput,
} from '../dto/get-session-history-dto';
import { toApplicationError, type ApplicationError } from '../errors/application-errors';

export type GetSessionHistoryDependencies = Readonly<{
  sourceSessionRepository: SourceSessionRepository;
}>;

export type GetSessionHistoryQuery = (
  input?: GetSessionHistoryInput,
) => ResultAsync<SessionHistorySummaryListOutput, ApplicationError>;

const toSummary = (session: SourceSession): SessionHistorySummary => {
  const startedAtMs = new Date(session.startedAt).getTime();
  const stoppedAtMs = session.stoppedAt === null ? null : new Date(session.stoppedAt).getTime();
  const durationMs =
    stoppedAtMs !== null && Number.isFinite(stoppedAtMs - startedAtMs)
      ? Math.max(0, stoppedAtMs - startedAtMs)
      : null;
  return {
    sessionId: session.sessionIdentifier,
    displayName: session.sessionIdentifier,
    sourceType: session.sourceType,
    state: session.state,
    sourceLanguage: session.languagePair.source,
    targetLanguage: session.languagePair.target,
    startedAt: session.startedAt,
    stoppedAt: session.stoppedAt,
    durationMs,
  };
};

/**
 * Issue #109 GetSessionHistoryQuery (新規)。
 *
 * `SourceSessionRepository.findAllSessions` で stopped 含む全 session を取り、
 * `startedAt` 降順で並べた `SessionHistorySummary[]` を返す。MVP では
 * pagination / filter は持たない (件数は MVP の同時 3 セッション + α 想定)。
 *
 * displayName は SourceSession に保持されないため (旧仕様で UI 側が独自に
 * `input.displayName` を握っていた) 、暫定で `sessionId` を表示名として返す。
 * displayName 永続化は後続 Issue で対応。
 */
export const createGetSessionHistoryQuery = (
  deps: GetSessionHistoryDependencies,
): GetSessionHistoryQuery => {
  return (rawInput) =>
    parseGetSessionHistoryInput(rawInput ?? {})
      .asyncAndThen(() => deps.sourceSessionRepository.findAllSessions())
      .map((sessions): SessionHistorySummaryListOutput => {
        const summaries = sessions
          .map(toSummary)
          .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
        return { sessions: summaries };
      })
      .mapErr(toApplicationError);
};
