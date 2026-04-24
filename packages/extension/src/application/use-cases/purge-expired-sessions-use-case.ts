import { okAsync, ResultAsync } from 'neverthrow';
import {
  DEFAULT_SESSION_RETENTION_POLICY,
  type SessionRetentionPolicy,
} from '../../domain/retention';
import { type DomainError } from '../../domain/shared/errors';
import { toApplicationError, type ApplicationError } from '../errors/application-errors';
import { type PurgeResult, type SessionStore } from '../ports/session-store';
import { type SettingsStore } from '../ports/settings-store';

export type PurgeExpiredSessionsDependencies = Readonly<{
  sessionStore: SessionStore;
  settingsStore: SettingsStore;
  clock: () => string;
}>;

export type PurgeExpiredSessionsOutput = Readonly<{
  purgedSessionIds: readonly string[];
  totalPurged: number;
}>;

export type PurgeExpiredSessionsUseCase = () => ResultAsync<
  PurgeExpiredSessionsOutput,
  ApplicationError
>;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const subtractDays = (iso: string, days: number): string => {
  const ms = new Date(iso).getTime();
  return new Date(ms - days * MS_PER_DAY).toISOString();
};

const resolvePolicy = (
  deps: PurgeExpiredSessionsDependencies,
): ResultAsync<SessionRetentionPolicy, DomainError> =>
  deps.settingsStore.getSessionRetentionPolicy().orElse((error) => {
    if (error.kind === 'not-found') {
      return okAsync<SessionRetentionPolicy, DomainError>(DEFAULT_SESSION_RETENTION_POLICY);
    }
    return okAsync<SessionRetentionPolicy, DomainError>(DEFAULT_SESSION_RETENTION_POLICY);
  });

/**
 * IMPL-217 PurgeExpiredSessionsUseCase (DD-239, Issue #124)。
 *
 * セッション履歴保持ポリシーに基づいて古い/超過セッションを削除する。
 * Service Worker 起動時と `chrome.alarms` (24h ごと) で呼び出される。
 *
 * - `policy.days` が set → `purgeOlderThan(now - days)` を実行
 * - `policy.maxCount` が set → `purgeBeyondCount(maxCount)` を実行
 * - 両方 set の場合は両方実行 (AND 条件で重複削除分は Set で deduplicate)
 */
export const createPurgeExpiredSessionsUseCase = (
  deps: PurgeExpiredSessionsDependencies,
): PurgeExpiredSessionsUseCase => {
  return () =>
    resolvePolicy(deps)
      .andThen((policy) => {
        const nowIso = deps.clock();
        const olderThanChain: ResultAsync<PurgeResult, DomainError> =
          policy.days === null
            ? okAsync<PurgeResult, DomainError>({ purgedSessionIds: [] })
            : deps.sessionStore.purgeOlderThan(subtractDays(nowIso, policy.days));
        return olderThanChain.andThen((olderResult) => {
          const beyondCountChain: ResultAsync<PurgeResult, DomainError> =
            policy.maxCount === null
              ? okAsync<PurgeResult, DomainError>({ purgedSessionIds: [] })
              : deps.sessionStore.purgeBeyondCount(policy.maxCount);
          return beyondCountChain.map((countResult): PurgeExpiredSessionsOutput => {
            const combined = new Set<string>([
              ...olderResult.purgedSessionIds,
              ...countResult.purgedSessionIds,
            ]);
            return {
              purgedSessionIds: [...combined],
              totalPurged: combined.size,
            };
          });
        });
      })
      .mapErr(toApplicationError);
};
