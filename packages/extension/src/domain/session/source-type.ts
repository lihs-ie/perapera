import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import { type DomainError, validationError } from '../shared/errors';

/**
 * 音声ソース種別 (DD-210 ソースセッション集約)。
 * 設計文書: detailed-design.md §5.1 `SourceType`
 */
export const SOURCE_TYPES = ['tab', 'microphone', 'desktop'] as const;

const sourceTypeSchema = z.enum(SOURCE_TYPES);

export type SourceType = z.infer<typeof sourceTypeSchema>;

export const parseSourceType = (value: unknown): Result<SourceType, DomainError> => {
  const result = sourceTypeSchema.safeParse(value);
  if (!result.success) {
    return err(
      validationError({
        field: 'SourceType',
        message: `expected one of [${SOURCE_TYPES.join(', ')}]`,
      }),
    );
  }
  return ok(result.data);
};
