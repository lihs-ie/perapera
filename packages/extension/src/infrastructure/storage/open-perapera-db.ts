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
 * バージョン履歴:
 * - v1: 初版。4 object store + `by-sessionId` index (DB-001〜004)
 * - v2: IMPL-318。`sessions.endpointing*` / `sessions.translationContext*`
 *       カラムを追加。既存レコードは upgrade hook で null を埋める
 *       (`sessionFromRecord` が読み込み時に VO 既定値を適用)。
 * - v3: IMPL-319。`sessions.glossaryEntries` を追加 (null 許容、nullable 配列)。
 *       既存 v1/v2 レコードは upgrade hook で null を埋め、
 *       `sessionFromRecord` が `EMPTY_GLOSSARY` を適用する (DD-238)。
 */

export const INDEXED_DB_NAME = 'perapera';
export const INDEXED_DB_VERSION = 3;

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

/**
 * IMPL-318 / IMPL-319 v1/v2 → v3 マイグレーション補助。cursor.value は TS 型
 * としては v3 の `SessionRow` と宣言されるが、実データは v1/v2 のため一部
 * カラムが欠落している可能性がある。必要フィールドを null で埋めて v3 形式に
 * 正規化する。
 */
const fillLatestDefaults = (row: SessionRow): SessionRow => ({
  sessionId: row.sessionId,
  sourceId: row.sourceId,
  sourceType: row.sourceType,
  state: row.state,
  sourceLanguage: row.sourceLanguage,
  targetLanguage: row.targetLanguage,
  startedAt: row.startedAt,
  stoppedAt: row.stoppedAt,
  degradedReason: row.degradedReason,
  endpointingSilenceMs: row.endpointingSilenceMs ?? null,
  endpointingPunctuationAware: row.endpointingPunctuationAware ?? null,
  endpointingMinUtteranceMs: row.endpointingMinUtteranceMs ?? null,
  translationContextMaxSegments: row.translationContextMaxSegments ?? null,
  translationContextIncludeTranslatedText: row.translationContextIncludeTranslatedText ?? null,
  glossaryEntries: row.glossaryEntries ?? null,
});

export const openPeraperaDb = (databaseName: string): Promise<IDBPDatabase<PeraperaSchema>> =>
  openDB<PeraperaSchema>(databaseName, INDEXED_DB_VERSION, {
    upgrade(db, oldVersion, _newVersion, transaction) {
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

      if (oldVersion < 3 && oldVersion !== 0) {
        // IMPL-318 / IMPL-319: v1/v2 → v3。sessions の新規カラム (endpointing*
        // / translationContext* / glossaryEntries) を null で埋める。
        // `sessionFromRecord` が null を検出した場合は DEFAULT VO で補完するため
        // データ損失なく読み込める。
        const store = transaction.objectStore(SESSIONS_STORE);
        void store.openCursor().then(function handleCursor(cursor): Promise<void> | void {
          if (cursor === null) return;
          const upgraded: SessionRow = fillLatestDefaults(cursor.value);
          return cursor.update(upgraded).then(() => cursor.continue().then(handleCursor));
        });
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
