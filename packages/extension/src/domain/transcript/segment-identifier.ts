import { err, ok, type Result } from 'neverthrow';
import { ulid } from 'ulid';
import { z } from 'zod';
import { type DomainError, validationError } from '../shared/errors.js';

/**
 * 字幕セグメントの識別子 (CLAUDE.md §命名規則)。
 * 部分字幕と確定字幕は同じ `SegmentIdentifier` を共有し、`isFinal` / `revision`
 * で区別する (DD-211 / DD-221 字幕ストリーム集約)。
 */
const segmentIdentifierSchema = z.string().ulid().brand<'SegmentIdentifier'>();

export type SegmentIdentifier = z.infer<typeof segmentIdentifierSchema>;

export const createSegmentIdentifier = (): SegmentIdentifier =>
  parseSegmentIdentifier(ulid())._unsafeUnwrap();

export const parseSegmentIdentifier = (value: unknown): Result<SegmentIdentifier, DomainError> => {
  const result = segmentIdentifierSchema.safeParse(value);
  if (!result.success) {
    return err(
      validationError({
        field: 'SegmentIdentifier',
        message: 'must be a ULID string',
      }),
    );
  }
  return ok(result.data);
};
