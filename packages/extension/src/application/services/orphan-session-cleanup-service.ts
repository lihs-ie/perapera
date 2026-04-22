import { ResultAsync, okAsync } from 'neverthrow';
import { type SourceSessionRepository } from '../../domain/repositories/source-session-repository';
import { stopSourceSession, type SourceSession } from '../../domain/session/source-session';
import { describeDomainError, type DomainError } from '../../domain/shared/errors';

/**
 * IMPL-603 OrphanSessionCleanupService (application service)。
 *
 * MV3 Service Worker は 30 秒 idle 後 shutdown されるため、SW 再起動時に
 * IndexedDB に残存していた非終端 (non-terminal) 状態の `SourceSession` は
 * 実在の capture / relay 接続を失った "orphan" 状態となる。本 service は
 * SW 起動時に 1 度だけ呼ばれ、これらを `stopped` 状態に遷移させることで:
 *
 * - Popup / SidePanel が "過去に終了した session" として扱える
 * - `findActiveSessions()` の結果が実体と整合する (capture / relay 未接続)
 * - `SessionConcurrencyPolicy` (上限 3) が正しく機能する
 *
 * **MVP の方針**: permission / capture / stream token の restore までは行わず、
 * orphan は一律 stopped 化する。ユーザーは Popup から明示的に新規 session を
 * 開始する (設計論点 §10)。`stopped` は terminal state で、state machine 上
 * 全 state から遷移可能 (detailed-design.md §7.2 の L32 一般規則)。
 *
 * **除外ケース**:
 * - `error` state: 既に terminal 扱い、改めて stopped 化しない (UI で "failed" を
 *   保持したほうがユーザーには有益)
 * - `stopped` state: そもそも `findActiveSessions()` に含まれない
 *
 * **本番実装で mock を使わない設計**:
 * - `sourceSessionRepository` は必須 DI (default なし)
 * - test では fake repository を注入して save 呼び出しを assert
 */
export type OrphanSessionCleanupService = Readonly<{
  /**
   * 全 orphan active session を stopped 遷移させて save する。
   * `findActiveSessions` 失敗は全体失敗として伝播、個別 session の save 失敗は
   * warn log + 次 session へ継続 (1 件の失敗が全体を止めない)。
   */
  cleanup: () => ResultAsync<CleanupResult, DomainError>;
}>;

export type CleanupResult = Readonly<{
  /** 実際に stopped state へ遷移・save 成功した session 数 */
  recoveredCount: number;
}>;

export type OrphanSessionCleanupDependencies = Readonly<{
  sourceSessionRepository: SourceSessionRepository;
  /** Now を ISO8601 文字列で返す clock。stopSourceSession の stoppedAt に使用 */
  clock: () => string;
  /** Err ログ sink。default console.warn */
  logWarn?: (message: string) => void;
}>;

const defaultLogWarn = (message: string): void => {
  console.warn(message);
};

const shouldSkip = (session: SourceSession): boolean => session.state === 'error';

export const createOrphanSessionCleanupService = (
  deps: OrphanSessionCleanupDependencies,
): OrphanSessionCleanupService => {
  const logWarn = deps.logWarn ?? defaultLogWarn;

  const processSingleSession = (session: SourceSession): ResultAsync<boolean, DomainError> => {
    if (shouldSkip(session)) return okAsync<boolean, DomainError>(false);
    const transition = stopSourceSession(session, { stoppedAt: deps.clock() });
    if (transition.isErr()) {
      logWarn(
        `[perapera] orphan-session-cleanup transition failed for ${session.sessionIdentifier}: ${describeDomainError(
          transition.error,
        )}`,
      );
      return okAsync<boolean, DomainError>(false);
    }
    return deps.sourceSessionRepository
      .save(transition.value)
      .map(() => true)
      .orElse((error) => {
        logWarn(
          `[perapera] orphan-session-cleanup save failed for ${session.sessionIdentifier}: ${describeDomainError(
            error,
          )}`,
        );
        return okAsync<boolean, DomainError>(false);
      });
  };

  return {
    cleanup: () =>
      deps.sourceSessionRepository.findActiveSessions().andThen((sessions) =>
        ResultAsync.combine(sessions.map(processSingleSession)).map((results) => ({
          recoveredCount: results.filter((recovered) => recovered).length,
        })),
      ),
  };
};
