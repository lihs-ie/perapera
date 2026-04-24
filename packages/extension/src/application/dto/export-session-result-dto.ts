import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import { EXPORT_FORMATS, type ExportFormat } from '../../domain/export/export-record';
import { type DomainError, validationError } from '../../domain/shared/errors';

/**
 * エクスポート実行入力 DTO (DTO-I-307, DD-307)。
 * 形式は `EXPORT_FORMATS` のみ許可 (DD-273 ExportFormatSpecification 準拠)。
 * `includeOriginal` / `includeTranslation` の両方が false の場合は
 * 出力内容が無いため defensive に validation で拒否する。
 */
export type ExportSessionResultInput = {
  sessionId: string;
  format: ExportFormat;
  includeOriginal: boolean;
  includeTranslation: boolean;
};

const exportSessionResultInputSchema = z
  .object({
    sessionId: z.string().min(1),
    format: z.enum(EXPORT_FORMATS),
    includeOriginal: z.boolean(),
    includeTranslation: z.boolean(),
  })
  .refine((value) => value.includeOriginal || value.includeTranslation, {
    message: 'at least one of includeOriginal / includeTranslation must be true',
  });

export const parseExportSessionResultInput = (
  raw: unknown,
): Result<ExportSessionResultInput, DomainError> => {
  const result = exportSessionResultInputSchema.safeParse(raw);
  if (!result.success) {
    return err(
      validationError({
        field: 'ExportSessionResultInput',
        message: result.error.issues.map((issue) => issue.message).join('; '),
      }),
    );
  }
  return ok(result.data);
};

/**
 * エクスポート実行出力 DTO (DTO-O-307)。
 * `ExportRecord` の `exportIdentifier` を `exportId` として primitive 化し、
 * 生成バイト数 `bytes` と整形済み本文 `content` を追加する。`content` は
 * presentation 層がそのまま `Blob` 化してダウンロードに用いる (Issue #106)。
 */
export type ExportSessionResultOutput = Readonly<{
  exportId: string;
  format: ExportFormat;
  bytes: number;
  content: string;
}>;
