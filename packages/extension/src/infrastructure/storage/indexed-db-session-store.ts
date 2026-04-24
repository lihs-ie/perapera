import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import { notFoundError, type DomainError } from '../../domain/shared/errors';
import {
  type ExportBundle,
  type PurgeResult,
  type SessionStore,
} from '../../application/ports/session-store';
import {
  EXPORT_STORE,
  INDEXED_DB_NAME,
  SESSIONS_STORE,
  TRANSCRIPT_STORE,
  TRANSLATION_STORE,
  createPeraperaDbHandle,
  toPersistenceError,
} from './open-perapera-db';
import {
  sessionFromRecord,
  sessionToRecord,
  transcriptSegmentToRecord,
  translationSegmentToRecord,
} from './records';
import { assembleTranscriptStream } from './transcript-stream-assembler';

/**
 * IndexedDB session store の拡張 interface。
 * `SessionStore` port に加えて、test cleanup や session worker のシャットダウン
 * 時にコネクションを閉じるための `close()` を提供する。
 */
export type CloseableSessionStore = SessionStore & {
  close: () => Promise<void>;
};

/**
 * IMPL-310 IndexedDbSessionStore (DD-106, DB-001〜004)。
 *
 * `idb` v8 で 4 object store を管理する `SessionStore` 実装。
 *
 * - `sessions` (DB-001): primary key = sessionId
 * - `transcript_segments` (DB-002): primary key = segmentId、
 *   `by-sessionId` index あり
 * - `translation_segments` (DB-003): primary key = translationId、
 *   `by-sessionId` index あり
 * - `export_records` (DB-004): primary key = exportId (本 store は
 *   ExportRecordRepository が使う)
 *
 * 非同期 append-only 設計 (CLAUDE.md §データ保存方針)。ホットパスから
 * fire-and-forget で呼ばれる想定で、書き込み失敗は UseCase 層で WARN ログ
 * に留める。
 *
 * DB 共通定義 (schema / 定数 / open helper) は `open-perapera-db.ts` に集約し、
 * domain Repository adapter 群 (`indexed-db-source-session-repository.ts` など)
 * と共有する。
 */
export type IndexedDbSessionStoreOptions = Readonly<{
  /** Override for tests. Production should omit this to use the default. */
  databaseName?: string;
}>;

export const createIndexedDbSessionStore = (
  options: IndexedDbSessionStoreOptions = {},
): CloseableSessionStore => {
  const databaseName = options.databaseName ?? INDEXED_DB_NAME;
  const handle = createPeraperaDbHandle(databaseName);

  return {
    saveSession: (session) =>
      ResultAsync.fromPromise(
        (async () => {
          const connection = await handle.get();
          await connection.put(SESSIONS_STORE, sessionToRecord(session));
        })(),
        toPersistenceError('saveSession'),
      ),

    appendTranscript: (sessionIdentifier, segment) =>
      ResultAsync.fromPromise(
        (async () => {
          const connection = await handle.get();
          await connection.put(
            TRANSCRIPT_STORE,
            transcriptSegmentToRecord(sessionIdentifier, segment),
          );
        })(),
        toPersistenceError('appendTranscript'),
      ),

    appendTranslation: (sessionIdentifier, translation) =>
      ResultAsync.fromPromise(
        (async () => {
          const connection = await handle.get();
          await connection.put(
            TRANSLATION_STORE,
            translationSegmentToRecord(sessionIdentifier, translation),
          );
        })(),
        toPersistenceError('appendTranslation'),
      ),

    loadExportBundle: (sessionIdentifier) =>
      ResultAsync.fromPromise(
        (async () => {
          const connection = await handle.get();
          const sessionRow = await connection.get(SESSIONS_STORE, sessionIdentifier);
          if (sessionRow === undefined) return null;
          const transcripts = await connection.getAllFromIndex(
            TRANSCRIPT_STORE,
            'by-sessionId',
            sessionIdentifier,
          );
          const translations = await connection.getAllFromIndex(
            TRANSLATION_STORE,
            'by-sessionId',
            sessionIdentifier,
          );
          return { sessionRow, transcripts, translations };
        })(),
        toPersistenceError('loadExportBundle'),
      ).andThen((raw): ResultAsync<ExportBundle, DomainError> => {
        if (raw === null) {
          return errAsync<ExportBundle, DomainError>(
            notFoundError({ resourceType: 'SourceSession', identifier: sessionIdentifier }),
          );
        }
        const sessionResult = sessionFromRecord(raw.sessionRow);
        if (sessionResult.isErr()) {
          return errAsync<ExportBundle, DomainError>(sessionResult.error);
        }
        const streamResult = assembleTranscriptStream(
          sessionIdentifier,
          raw.transcripts,
          raw.translations,
        );
        if (streamResult.isErr()) {
          return errAsync<ExportBundle, DomainError>(streamResult.error);
        }
        return okAsync<ExportBundle, DomainError>({
          session: sessionResult.value,
          stream: streamResult.value,
        });
      }),

    purgeOlderThan: (beforeIso) =>
      ResultAsync.fromPromise(
        (async () => {
          const connection = await handle.get();
          const tx = connection.transaction(
            [SESSIONS_STORE, TRANSCRIPT_STORE, TRANSLATION_STORE, EXPORT_STORE],
            'readwrite',
          );
          const sessionsStore = tx.objectStore(SESSIONS_STORE);
          const transcriptStore = tx.objectStore(TRANSCRIPT_STORE);
          const translationStore = tx.objectStore(TRANSLATION_STORE);
          const exportStore = tx.objectStore(EXPORT_STORE);
          const allSessions = await sessionsStore.getAll();
          const targets = allSessions.filter((row) => row.startedAt < beforeIso);
          const purgedSessionIds: string[] = [];
          for (const row of targets) {
            purgedSessionIds.push(row.sessionId);
            await sessionsStore.delete(row.sessionId);
            const transcriptIds = await transcriptStore
              .index('by-sessionId')
              .getAllKeys(row.sessionId);
            for (const id of transcriptIds) {
              await transcriptStore.delete(id);
            }
            const translationIds = await translationStore
              .index('by-sessionId')
              .getAllKeys(row.sessionId);
            for (const id of translationIds) {
              await translationStore.delete(id);
            }
            const exportIds = await exportStore.index('by-sessionId').getAllKeys(row.sessionId);
            for (const id of exportIds) {
              await exportStore.delete(id);
            }
          }
          await tx.done;
          return purgedSessionIds;
        })(),
        toPersistenceError('purgeOlderThan'),
      ).map((purgedSessionIds): PurgeResult => ({ purgedSessionIds })),

    purgeBeyondCount: (maxCount) =>
      ResultAsync.fromPromise(
        (async () => {
          const connection = await handle.get();
          const tx = connection.transaction(
            [SESSIONS_STORE, TRANSCRIPT_STORE, TRANSLATION_STORE, EXPORT_STORE],
            'readwrite',
          );
          const sessionsStore = tx.objectStore(SESSIONS_STORE);
          const transcriptStore = tx.objectStore(TRANSCRIPT_STORE);
          const translationStore = tx.objectStore(TRANSLATION_STORE);
          const exportStore = tx.objectStore(EXPORT_STORE);
          const allSessions = await sessionsStore.getAll();
          if (allSessions.length <= maxCount) {
            await tx.done;
            return [];
          }
          // 古い順 (startedAt ascending) にソートし、先頭から excess を削除対象に
          const sorted = [...allSessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
          const excess = sorted.slice(0, sorted.length - maxCount);
          const purgedSessionIds: string[] = [];
          for (const row of excess) {
            purgedSessionIds.push(row.sessionId);
            await sessionsStore.delete(row.sessionId);
            const transcriptIds = await transcriptStore
              .index('by-sessionId')
              .getAllKeys(row.sessionId);
            for (const id of transcriptIds) {
              await transcriptStore.delete(id);
            }
            const translationIds = await translationStore
              .index('by-sessionId')
              .getAllKeys(row.sessionId);
            for (const id of translationIds) {
              await translationStore.delete(id);
            }
            const exportIds = await exportStore.index('by-sessionId').getAllKeys(row.sessionId);
            for (const id of exportIds) {
              await exportStore.delete(id);
            }
          }
          await tx.done;
          return purgedSessionIds;
        })(),
        toPersistenceError('purgeBeyondCount'),
      ).map((purgedSessionIds): PurgeResult => ({ purgedSessionIds })),

    purgeAll: () =>
      ResultAsync.fromPromise(
        (async () => {
          const connection = await handle.get();
          const tx = connection.transaction(
            [SESSIONS_STORE, TRANSCRIPT_STORE, TRANSLATION_STORE, EXPORT_STORE],
            'readwrite',
          );
          const sessionIds = await tx.objectStore(SESSIONS_STORE).getAllKeys();
          await tx.objectStore(SESSIONS_STORE).clear();
          await tx.objectStore(TRANSCRIPT_STORE).clear();
          await tx.objectStore(TRANSLATION_STORE).clear();
          await tx.objectStore(EXPORT_STORE).clear();
          await tx.done;
          return sessionIds;
        })(),
        toPersistenceError('purgeAll'),
      ).map((purgedSessionIds): PurgeResult => ({ purgedSessionIds })),

    close: handle.close,
  };
};

export { INDEXED_DB_NAME, INDEXED_DB_VERSION } from './open-perapera-db';
