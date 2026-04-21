import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import { type DomainError, validationError } from '../shared/errors';

/**
 * 字幕セグメントのタイムスタンプ範囲 (DD-235)。
 * セッション開始からの milliseconds オフセット。`start <= end`。
 */
const timestampRangeSchema = z
  .object({
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().nonnegative(),
  })
  .refine((range) => range.startMs <= range.endMs, {
    message: 'startMs must be <= endMs',
  })
  .brand<'TimestampRange'>();

export type TimestampRange = z.infer<typeof timestampRangeSchema>;

export const createTimestampRange = (params: unknown): Result<TimestampRange, DomainError> => {
  const result = timestampRangeSchema.safeParse(params);
  if (!result.success) {
    return err(
      validationError({
        field: 'TimestampRange',
        message: result.error.issues.map((issue) => issue.message).join('; '),
      }),
    );
  }
  return ok(result.data);
};
