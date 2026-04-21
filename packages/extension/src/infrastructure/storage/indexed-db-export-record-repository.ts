import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import { type ExportRecord } from '../../domain/export/export-record';
import { type ExportRecordRepository } from '../../domain/repositories/export-record-repository';
import { type DomainError, invariantViolationError } from '../../domain/shared/errors';
import { EXPORT_STORE, INDEXED_DB_NAME, createPeraperaDbHandle } from './open-perapera-db';
import { exportRecordFromRecord, exportRecordToRecord } from './records';

/**
 * 拡張インタフェース。`ExportRecordRepository` に加えてテスト cleanup や
 * Service Worker シャットダウン用の `close()` を公開する。
 */
export type CloseableExportRecordRepository = ExportRecordRepository & {
  close: () => Promise<void>;
};

export type IndexedDbExportRecordRepositoryOptions = Readonly<{
  /** Override for tests. Production should omit to use the default. */
  databaseName?: string;
}>;

const toPersistenceError =
  (scope: string) =>
  (cause: unknown): DomainError =>
    invariantViolationError({
      invariant: 'export-persistence',
      details: `${scope}: ${cause instanceof Error ? cause.message : 'unknown error'}`,
    });

/**
 * IMPL-143 IndexedDbExportRecordRepository (DD-263, DB-004)。
 *
 * `export_records` object store を介した `ExportRecord` エンティティの
 * 永続化 adapter。`by-sessionId` index で検索する。
 *
 * - `save`: upsert。失敗は `invariantViolationError({ invariant: 'export-persistence' })`
 * - `findBySessionId`: `by-sessionId` index で全行取得。0 件は `ok([])`
 *   (`ExportRecordRepository.findBySessionId` の契約 — 空履歴は正常)
 */
export const createIndexedDbExportRecordRepository = (
  options: IndexedDbExportRecordRepositoryOptions = {},
): CloseableExportRecordRepository => {
  const databaseName = options.databaseName ?? INDEXED_DB_NAME;
  const handle = createPeraperaDbHandle(databaseName);

  return {
    save: (record) =>
      ResultAsync.fromPromise(
        (async () => {
          const connection = await handle.get();
          await connection.put(EXPORT_STORE, exportRecordToRecord(record));
        })(),
        toPersistenceError('save'),
      ),

    findBySessionId: (sessionIdentifier) =>
      ResultAsync.fromPromise(
        (async () => {
          const connection = await handle.get();
          return connection.getAllFromIndex(EXPORT_STORE, 'by-sessionId', sessionIdentifier);
        })(),
        toPersistenceError('findBySessionId'),
      ).andThen((rows): ResultAsync<readonly ExportRecord[], DomainError> => {
        const records: ExportRecord[] = [];
        for (const row of rows) {
          const parsed = exportRecordFromRecord(row);
          if (parsed.isErr()) {
            return errAsync<readonly ExportRecord[], DomainError>(parsed.error);
          }
          records.push(parsed.value);
        }
        return okAsync<readonly ExportRecord[], DomainError>(records);
      }),

    close: handle.close,
  };
};
