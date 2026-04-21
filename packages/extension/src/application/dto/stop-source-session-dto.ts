import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import { type DomainError, validationError } from '../../domain/shared/errors';

/**
 * セッション停止入力 DTO (DTO-I-306, DD-306)。
 * Popup / Side Panel UI から UseCase 層へ渡される境界型。Zod で runtime 検証。
 */
export type StopSourceSessionInput = {
  sessionId: string;
  reason?: string | undefined;
};

const stopSourceSessionInputSchema = z.object({
  sessionId: z.string().min(1),
  reason: z.string().optional(),
});

export const parseStopSourceSessionInput = (
  raw: unknown,
): Result<StopSourceSessionInput, DomainError> => {
  const result = stopSourceSessionInputSchema.safeParse(raw);
  if (!result.success) {
    return err(
      validationError({
        field: 'StopSourceSessionInput',
        message: result.error.issues.map((issue) => issue.message).join('; '),
      }),
    );
  }
  return ok(result.data);
};

/**
 * セッション停止出力 DTO (DTO-O-306)。
 * UseCase 層から UI 層へ返される投影型。`SourceSession` から `sessionId` /
 * `state` / `stoppedAt` を抽出。
 */
export type StopSourceSessionOutput = Readonly<{
  sessionId: string;
  state: string;
  stoppedAt: string;
}>;
