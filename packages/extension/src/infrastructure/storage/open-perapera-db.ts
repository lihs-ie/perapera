import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { invariantViolationError, type DomainError } from '../../domain/shared/errors';
import {
  type SessionRow,
  type TranscriptSegmentRow,
  type TranslationSegmentRow,
  type ExportRecordRow,
} from './records';

/**
 * IndexedDB open helper (DD-106, DB-001〜004)。
 *
 * `IndexedDbSessionStore` と `IndexedDb*Repository` adapter 群が共有する DB
 * 定義の単一入口。`idb` v8 の `openDB` を wrap し、4 object store + index
 * を宣言する。同一 adapter 内では一度開いた `IDBPDatabase` を使い回し、
 * 複数 adapter 間では別の connection を張るのが既定 (test helper 越しに
 * 共有させる場合のみ `IDBPDatabase` を直接受け取る factory を用意)。
 *
 * MVP の DB version は `1` 固定。設計書 (DB-001〜003) の補助 index
 * (`idx_sessions_state` など) は現段階では追加しておらず、全スキャン +
 * フィルタで active 検出する (active session 件数は最大 3 前提)。
 * 運用で顕在化した場合は version bump で追加する。
 */

export const INDEXED_DB_NAME = 'perapera';
export const INDEXED_DB_VERSION = 1;

export const SESSIONS_STORE = 'sessions';
export const TRANSCRIPT_STORE = 'transcript_segments';
export const TRANSLATION_STORE = 'translation_segments';
export const EXPORT_STORE = 'export_records';

export interface PeraperaSchema extends DBSchema {
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
    value: ExportRecordRow;
    indexes: { 'by-sessionId': string };
  };
}

export const openPeraperaDb = (databaseName: string): Promise<IDBPDatabase<PeraperaSchema>> =>
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

/**
 * 永続化失敗を `invariantViolationError` に正規化する factory。adapter 側の
 * catch ハンドラから scope 名 (例: `'saveSession'`, `'findActiveSessions'`)
 * を付けて呼ぶ。
 */
export const toPersistenceError =
  (scope: string) =>
  (cause: unknown): DomainError =>
    invariantViolationError({
      invariant: 'session-persistence',
      details: `${scope}: ${cause instanceof Error ? cause.message : 'unknown error'}`,
    });

/**
 * 遅延初期化する DB connection holder。adapter 内部で 1 connection を
 * 共有する用途に用いる。`close()` はすでに開いていた connection を閉じ、
 * 次回 `get()` 呼び出し時に再 open する。
 */
export type PeraperaDbHandle = Readonly<{
  get: () => Promise<IDBPDatabase<PeraperaSchema>>;
  close: () => Promise<void>;
}>;

export const createPeraperaDbHandle = (databaseName: string): PeraperaDbHandle => {
  let dbPromise: Promise<IDBPDatabase<PeraperaSchema>> | null = null;
  return {
    get: () => {
      dbPromise ??= openPeraperaDb(databaseName);
      return dbPromise;
    },
    close: async () => {
      if (dbPromise !== null) {
        const connection = await dbPromise;
        connection.close();
        dbPromise = null;
      }
    },
  };
};
