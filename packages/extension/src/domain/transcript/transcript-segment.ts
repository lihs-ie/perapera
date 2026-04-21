import { err, ok, type Result } from 'neverthrow';
import { type DomainError, invariantViolationError, validationError } from '../shared/errors.js';
import { parseSegmentIdentifier, type SegmentIdentifier } from './segment-identifier.js';
import { type TimestampRange } from './timestamp-range.js';

/**
 * 字幕セグメントエンティティ (DD-221)。
 *
 * - `revision`: 部分字幕の更新回数 (1 始まり、単調増加)
 * - `isFinal`: 確定字幕かどうか。false → true の遷移のみ可、逆方向不可
 * - 確定後は revision / text / timeRange の更新不可
 *   (再確定は別集約操作でやり直す)
 */
export type TranscriptSegment = Readonly<{
  segmentIdentifier: SegmentIdentifier;
  revision: number;
  isFinal: boolean;
  text: string;
  timeRange: TimestampRange;
}>;

const validateText = (text: string): Result<string, DomainError> => {
  if (text.length === 0) {
    return err(validationError({ field: 'TranscriptSegment.text', message: 'must not be empty' }));
  }
  return ok(text);
};

const validateRevision = (revision: number): Result<number, DomainError> => {
  if (!Number.isInteger(revision) || revision < 1) {
    return err(
      validationError({
        field: 'TranscriptSegment.revision',
        message: 'must be a positive integer',
      }),
    );
  }
  return ok(revision);
};

export const createPartialTranscriptSegment = (params: {
  segmentIdentifier: string;
  revision: number;
  text: string;
  timeRange: TimestampRange;
}): Result<TranscriptSegment, DomainError> =>
  parseSegmentIdentifier(params.segmentIdentifier).andThen((segmentIdentifier) =>
    validateRevision(params.revision).andThen((revision) =>
      validateText(params.text).map((text) => ({
        segmentIdentifier,
        revision,
        isFinal: false,
        text,
        timeRange: params.timeRange,
      })),
    ),
  );

export const updatePartialTranscriptSegment = (
  current: TranscriptSegment,
  next: { revision: number; text: string; timeRange?: TimestampRange },
): Result<TranscriptSegment, DomainError> => {
  if (current.isFinal) {
    return err(
      invariantViolationError({
        invariant: 'partial-update-on-final-segment',
        details: `segment ${current.segmentIdentifier} is already finalized`,
      }),
    );
  }
  if (next.revision <= current.revision) {
    return err(
      invariantViolationError({
        invariant: 'monotonic-revision',
        details: `revision must increase: current=${String(current.revision)}, next=${String(next.revision)}`,
      }),
    );
  }
  return validateText(next.text).map((text) => ({
    ...current,
    revision: next.revision,
    text,
    timeRange: next.timeRange ?? current.timeRange,
  }));
};

export const finalizeTranscriptSegment = (
  current: TranscriptSegment,
  override: { text?: string; timeRange?: TimestampRange },
): Result<TranscriptSegment, DomainError> => {
  if (current.isFinal) {
    return err(
      invariantViolationError({
        invariant: 'single-finalization',
        details: `segment ${current.segmentIdentifier} is already finalized`,
      }),
    );
  }
  const text = override.text ?? current.text;
  return validateText(text).map(() => ({
    ...current,
    isFinal: true,
    text,
    timeRange: override.timeRange ?? current.timeRange,
  }));
};
