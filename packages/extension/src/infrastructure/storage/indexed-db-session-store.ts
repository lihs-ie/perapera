import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { ResultAsync, err, errAsync, ok, okAsync, type Result } from 'neverthrow';
import {
  invariantViolationError,
  notFoundError,
  type DomainError,
} from '../../domain/shared/errors';
import { type SessionIdentifier } from '../../domain/session/session-identifier';
import { type TranscriptSegment } from '../../domain/transcript/transcript-segment';
import { type TranscriptStream } from '../../domain/transcript/transcript-stream';
import { type TranslationSegment } from '../../domain/transcript/translation-segment';
import { type ExportBundle, type SessionStore } from '../../application/ports/session-store';
import {
  sessionFromRecord,
  sessionToRecord,
  transcriptSegmentFromRecord,
  transcriptSegmentToRecord,
  translationSegmentFromRecord,
  translationSegmentToRecord,
  type SessionRow,
  type TranscriptSegmentRow,
  type TranslationSegmentRow,
} from './records';

export const INDEXED_DB_NAME = 'perapera';
export const INDEXED_DB_VERSION = 1;

const SESSIONS_STORE = 'sessions';
const TRANSCRIPT_STORE = 'transcript_segments';
const TRANSLATION_STORE = 'translation_segments';
const EXPORT_STORE = 'export_records';

interface PeraperaSchema extends DBSchema {
  sessions: {
    key: string;
    value: SessionRow;
  };
  transcript_segments: {
    key: string;
    value: TranscriptSegmentRow;
    indexes: { 'by-sessionId': string };
  };
  translation_segments: {
    key: string;
    value: TranslationSegmentRow;
    indexes: { 'by-sessionId': string };
  };
  export_records: {
    key: string;
    value: {
      exportId: string;
      sessionId: string;
      format: 'txt' | 'json';
      includeOriginal: boolean;
      includeTranslation: boolean;
      createdAt: string;
    };
    indexes: { 'by-sessionId': string };
  };
}

const openPeraperaDb = (databaseName: string): Promise<IDBPDatabase<PeraperaSchema>> =>
  openDB<PeraperaSchema>(databaseName, INDEXED_DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
        db.createObjectStore(SESSIONS_STORE, { keyPath: 'sessionId' });
      }
      if (!db.objectStoreNames.contains(TRANSCRIPT_STORE)) {
        const store = db.createObjectStore(TRANSCRIPT_STORE, { keyPath: 'segmentId' });
        store.createIndex('by-sessionId', 'sessionId');
      }
      if (!db.objectStoreNames.contains(TRANSLATION_STORE)) {
        const store = db.createObjectStore(TRANSLATION_STORE, { keyPath: 'translationId' });
        store.createIndex('by-sessionId', 'sessionId');
      }
      if (!db.objectStoreNames.contains(EXPORT_STORE)) {
        const store = db.createObjectStore(EXPORT_STORE, { keyPath: 'exportId' });
        store.createIndex('by-sessionId', 'sessionId');
      }
    },
  });

const toPersistenceError =
  (scope: string) =>
  (cause: unknown): DomainError =>
    invariantViolationError({
      invariant: 'session-persistence',
      details: `${scope}: ${cause instanceof Error ? cause.message : 'unknown error'}`,
    });

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
 */
export type IndexedDbSessionStoreOptions = Readonly<{
  /** Override for tests. Production should omit this to use the default. */
  databaseName?: string;
}>;

export const createIndexedDbSessionStore = (
  options: IndexedDbSessionStoreOptions = {},
): CloseableSessionStore => {
  const databaseName = options.databaseName ?? INDEXED_DB_NAME;
  let dbPromise: Promise<IDBPDatabase<PeraperaSchema>> | null = null;
  const db = (): Promise<IDBPDatabase<PeraperaSchema>> => {
    dbPromise ??= openPeraperaDb(databaseName);
    return dbPromise;
  };

  const buildStream = (
    sessionIdentifier: SessionIdentifier,
    transcripts: readonly TranscriptSegmentRow[],
    translations: readonly TranslationSegmentRow[],
  ): Result<TranscriptStream, DomainError> => {
    const segments = new Map<string, TranscriptSegment>();
    for (const row of transcripts) {
      const result = transcriptSegmentFromRecord(row);
      if (result.isErr()) return err(result.error);
      segments.set(result.value.segmentIdentifier, result.value);
    }
    const translationMap = new Map<string, TranslationSegment>();
    for (const row of translations) {
      const result = translationSegmentFromRecord(row);
      if (result.isErr()) return err(result.error);
      translationMap.set(result.value.segmentIdentifier, result.value);
    }
    const stream: TranscriptStream = {
      sessionIdentifier,
      segments,
      translations: translationMap,
    };
    return ok(stream);
  };

  return {
    saveSession: (session) =>
      ResultAsync.fromPromise(
        (async () => {
          const connection = await db();
          await connection.put(SESSIONS_STORE, sessionToRecord(session));
        })(),
        toPersistenceError('saveSession'),
      ),

    appendTranscript: (sessionIdentifier, segment) =>
      ResultAsync.fromPromise(
        (async () => {
          const connection = await db();
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
          const connection = await db();
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
          const connection = await db();
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
        const streamResult = buildStream(sessionIdentifier, raw.transcripts, raw.translations);
        if (streamResult.isErr()) {
          return errAsync<ExportBundle, DomainError>(streamResult.error);
        }
        return okAsync<ExportBundle, DomainError>({
          session: sessionResult.value,
          stream: streamResult.value,
        });
      }),

    close: async () => {
      if (dbPromise !== null) {
        const connection = await dbPromise;
        connection.close();
        dbPromise = null;
      }
    },
  };
};
