import { type ResultAsync } from 'neverthrow';
import { type ExportRecord } from '../export/export-record';
import { type SessionIdentifier } from '../session/session-identifier';
import { type DomainError } from '../shared/errors';

/**
 * エクスポート履歴リポジトリ (DD-263)。
 *
 * `ExportRecord` エンティティの永続化契約。MVP では IndexedDB 内の
 * `export_records` object store にマッピングされる (DB-004)。
 *
 * エラー:
 * - `save`: storage 書き込み失敗時は
 *   `invariantViolationError({ invariant: 'export-persistence', ... })` を想定
 * - `findBySessionId`: **0 件は `ok([])` で返す**。セッション自体の存在確認は
 *   別レイヤーの責務であり、本リポジトリは「当該セッションに紐づく履歴」のみを
 *   扱う。空履歴は正常ケース
 */
export type ExportRecordRepository = Readonly<{
  save: (record: ExportRecord) => ResultAsync<void, DomainError>;
  findBySessionId: (
    sessionIdentifier: SessionIdentifier,
  ) => ResultAsync<readonly ExportRecord[], DomainError>;
}>;
