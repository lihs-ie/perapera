import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import { notFoundError, type DomainError } from '../../domain/shared/errors';
import { type ExportBundle, type SessionStore } from '../../application/ports/session-store';
import {
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

    close: handle.close,
  };
};

export { INDEXED_DB_NAME, INDEXED_DB_VERSION } from './open-perapera-db';
