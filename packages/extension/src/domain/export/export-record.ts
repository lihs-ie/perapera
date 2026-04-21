import { err, type Result } from 'neverthrow';
import { z } from 'zod';
import { parseSessionIdentifier, type SessionIdentifier } from '../session/session-identifier.js';
import { type DomainError, validationError } from '../shared/errors.js';
import { parseExportIdentifier, type ExportIdentifier } from './export-identifier.js';

/**
 * エクスポート形式の列挙 (DD-273 ExportFormatSpecification)。
 * TXT / JSON のみ許可する。
 */
export const EXPORT_FORMATS = ['txt', 'json'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/**
 * エクスポートレコード (DD-223、表示・エクスポートコンテキスト DD-203)。
 * ライフサイクル: 利用者の明示操作で生成 → 出力完了。
 *
 * 不変条件:
 * - `includeOriginal` / `includeTranslation` の少なくとも一方は true
 *   (両方 false では出力するコンテンツが無い)
 * - `format` は EXPORT_FORMATS のいずれか
 * - `createdAt` は ISO 8601 UTC 文字列
 */
export type ExportRecord = Readonly<{
  exportIdentifier: ExportIdentifier;
  sessionIdentifier: SessionIdentifier;
  format: ExportFormat;
  includeOriginal: boolean;
  includeTranslation: boolean;
  createdAt: string;
}>;

const formatSchema = z.enum(EXPORT_FORMATS);
const iso8601Schema = z.string().datetime();

export const createExportRecord = (params: {
  exportIdentifier: string;
  sessionIdentifier: string;
  format: string;
  includeOriginal: boolean;
  includeTranslation: boolean;
  createdAt: string;
}): Result<ExportRecord, DomainError> => {
  const formatResult = formatSchema.safeParse(params.format);
  if (!formatResult.success) {
    return err(
      validationError({
        field: 'ExportRecord.format',
        message: `expected one of [${EXPORT_FORMATS.join(', ')}]`,
      }),
    );
  }
  const createdAtResult = iso8601Schema.safeParse(params.createdAt);
  if (!createdAtResult.success) {
    return err(
      validationError({
        field: 'ExportRecord.createdAt',
        message: 'must be ISO 8601 datetime',
      }),
    );
  }
  if (!params.includeOriginal && !params.includeTranslation) {
    return err(
      validationError({
        field: 'ExportRecord',
        message: 'at least one of includeOriginal / includeTranslation must be true',
      }),
    );
  }
  return parseExportIdentifier(params.exportIdentifier).andThen((exportIdentifier) =>
    parseSessionIdentifier(params.sessionIdentifier).map((sessionIdentifier) => ({
      exportIdentifier,
      sessionIdentifier,
      format: formatResult.data,
      includeOriginal: params.includeOriginal,
      includeTranslation: params.includeTranslation,
      createdAt: createdAtResult.data,
    })),
  );
};
