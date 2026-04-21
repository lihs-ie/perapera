import { EXPORT_FORMATS, type ExportFormat } from '../export/export-record.js';

/**
 * エクスポート形式仕様 (DD-273)。
 *
 * エクスポート形式は TXT / JSON のみ許可する。値オブジェクト定義
 * (`export-record.ts` の `EXPORT_FORMATS`) に委譲し、spec は runtime 述語
 * (type guard) を提供する。
 *
 * Policy との責務分担: 本 spec は `boolean` を返す純粋述語。違反時の
 * `DomainError` 組み立ては呼び出し側 (`createExportRecord` の `validationError`
 * 生成など) が担う。
 */
export const isValidExportFormat = (value: unknown): value is ExportFormat => {
  if (typeof value !== 'string') return false;
  return EXPORT_FORMATS.some((format) => format === value);
};
