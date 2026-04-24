import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import { type SourceSessionRepository } from '../../domain/repositories/source-session-repository';
import { type SourceSession } from '../../domain/session/source-session';
import { notFoundError, type DomainError } from '../../domain/shared/errors';
import { isActiveSession } from '../../domain/specifications/concurrent-session-limit-specification';
import {
  INDEXED_DB_NAME,
  SESSIONS_STORE,
  createPeraperaDbHandle,
  toPersistenceError,
} from './open-perapera-db';
import { sessionFromRecord, sessionToRecord } from './records';

/**
 * 拡張インタフェース。`SourceSessionRepository` に加えてテストおよび
 * Service Worker シャットダウン時に `IDBPDatabase` を明示 close するための
 * `close()` を公開する。
 */
export type CloseableSourceSessionRepository = SourceSessionRepository & {
  close: () => Promise<void>;
};

export type IndexedDbSourceSessionRepositoryOptions = Readonly<{
  /** Override for tests. Production should omit to use the default. */
  databaseName?: string;
}>;

/**
 * IMPL-140 IndexedDbSourceSessionRepository (DD-260, DB-001)。
 *
 * `sessions` object store を介した `SourceSession` 集約の永続化 adapter。
 * `IndexedDbSessionStore` (DD-106 / application SessionStore) と同じ IndexedDB
 * (`open-perapera-db.ts` の schema / 定数) を共有する。
 *
 * - `findById`: `get(SESSIONS_STORE, id)` → 未検出で `notFoundError`
 * - `findActiveSessions`: 全件取得 → `isActiveSession` でフィルタ。0 件は `ok([])`
 *   (MVP では同時 3 セッション前提で full-scan で十分、index は DB v2 で検討)
 * - `save`: `put` による upsert
 *
 * エラー型:
 * - 永続化 I/O 失敗: `invariantViolationError({ invariant: 'session-persistence' })`
 *   (`toPersistenceError` 共通 factory 経由)
 * - 行データからの aggregate 復元失敗: `sessionFromRecord` が返す DomainError
 *   (Zod / branded type バリデーション)
 */
export const createIndexedDbSourceSessionRepository = (
  options: IndexedDbSourceSessionRepositoryOptions = {},
): CloseableSourceSessionRepository => {
  const databaseName = options.databaseName ?? INDEXED_DB_NAME;
  const handle = createPeraperaDbHandle(databaseName);

  return {
    findById: (sessionIdentifier) =>
      ResultAsync.fromPromise(
        (async () => {
          const connection = await handle.get();
          return connection.get(SESSIONS_STORE, sessionIdentifier);
        })(),
        toPersistenceError('findById'),
      ).andThen((row): ResultAsync<SourceSession, DomainError> => {
        if (row === undefined) {
          return errAsync<SourceSession, DomainError>(
            notFoundError({ resourceType: 'SourceSession', identifier: sessionIdentifier }),
          );
        }
        const parsed = sessionFromRecord(row);
        if (parsed.isErr()) {
          return errAsync<SourceSession, DomainError>(parsed.error);
        }
        return okAsync<SourceSession, DomainError>(parsed.value);
      }),

    findActiveSessions: () =>
      ResultAsync.fromPromise(
        (async () => {
          const connection = await handle.get();
          return connection.getAll(SESSIONS_STORE);
        })(),
        toPersistenceError('findActiveSessions'),
      ).andThen((rows): ResultAsync<readonly SourceSession[], DomainError> => {
        const sessions: SourceSession[] = [];
        for (const row of rows) {
          const parsed = sessionFromRecord(row);
          if (parsed.isErr()) {
            return errAsync<readonly SourceSession[], DomainError>(parsed.error);
          }
          if (isActiveSession(parsed.value)) {
            sessions.push(parsed.value);
          }
        }
        return okAsync<readonly SourceSession[], DomainError>(sessions);
      }),

    findAllSessions: () =>
      ResultAsync.fromPromise(
        (async () => {
          const connection = await handle.get();
          return connection.getAll(SESSIONS_STORE);
        })(),
        toPersistenceError('findAllSessions'),
      ).andThen((rows): ResultAsync<readonly SourceSession[], DomainError> => {
        const sessions: SourceSession[] = [];
        for (const row of rows) {
          const parsed = sessionFromRecord(row);
          if (parsed.isErr()) {
            return errAsync<readonly SourceSession[], DomainError>(parsed.error);
          }
          sessions.push(parsed.value);
        }
        return okAsync<readonly SourceSession[], DomainError>(sessions);
      }),

    save: (session) =>
      ResultAsync.fromPromise(
        (async () => {
          const connection = await handle.get();
          await connection.put(SESSIONS_STORE, sessionToRecord(session));
        })(),
        toPersistenceError('save'),
      ),

    close: handle.close,
  };
};
