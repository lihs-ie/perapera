import { err, ok, type Result } from 'neverthrow';
import { ulid } from 'ulid';
import { z } from 'zod';
import { type DomainError, validationError } from '../shared/errors';

/**
 * エクスポートレコード (`ExportRecord`, DD-223) の識別子。
 * 表示・エクスポートコンテキスト (DD-203)。
 */
const exportIdentifierSchema = z.string().ulid().brand<'ExportIdentifier'>();

export type ExportIdentifier = z.infer<typeof exportIdentifierSchema>;

export const createExportIdentifier = (): ExportIdentifier =>
  parseExportIdentifier(ulid())._unsafeUnwrap();

export const parseExportIdentifier = (value: unknown): Result<ExportIdentifier, DomainError> => {
  const result = exportIdentifierSchema.safeParse(value);
  if (!result.success) {
    return err(
      validationError({
        field: 'ExportIdentifier',
        message: 'must be a ULID string',
      }),
    );
  }
  return ok(result.data);
};
