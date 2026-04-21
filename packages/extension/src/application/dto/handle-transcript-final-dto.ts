import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import { type DomainError, validationError } from '../../domain/shared/errors';
import { type OverlayRenderModel } from '../ports/overlay-presenter';

const bcp47Schema = z.string().regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/);

const timeRangeSchema = z
  .object({
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().nonnegative(),
  })
  .refine((value) => value.startMs <= value.endMs, {
    message: 'startMs must be <= endMs',
  });

const translationPayloadSchema = z.object({
  targetLanguage: bcp47Schema,
  text: z.string(),
  status: z.enum(['completed', 'failed']),
});

/**
 * 確定字幕処理入力 DTO (DTO-I-305, DD-305)。
 *
 * `translation` はオプション — 翻訳が間に合っていない時点で UseCase が
 * 呼ばれた場合、`translation` なしで受け取り、後続の翻訳完了時に
 * `HandleTranslationFinalEvent` 相当の別経路で反映する (設計書 §6.2 結果整合性)。
 *
 * `translation.status === 'failed'` 時は `text` が空文字でも許容 (実装側では
 * `TranslationSegment.failed` として扱う)。
 */
export type HandleTranscriptFinalInput = {
  sessionId: string;
  segmentId: string;
  text: string;
  timeRange: {
    startMs: number;
    endMs: number;
  };
  translation?:
    | {
        targetLanguage: string;
        text: string;
        status: 'completed' | 'failed';
      }
    | undefined;
};

const handleTranscriptFinalInputSchema = z.object({
  sessionId: z.string().min(1),
  segmentId: z.string().min(1),
  text: z.string().min(1),
  timeRange: timeRangeSchema,
  translation: translationPayloadSchema.optional(),
});

export const parseHandleTranscriptFinalInput = (
  raw: unknown,
): Result<HandleTranscriptFinalInput, DomainError> => {
  const result = handleTranscriptFinalInputSchema.safeParse(raw);
  if (!result.success) {
    return err(
      validationError({
        field: 'HandleTranscriptFinalInput',
        message: result.error.issues.map((issue) => issue.message).join('; '),
      }),
    );
  }
  return ok(result.data);
};

/**
 * 確定字幕処理出力 DTO (DTO-O-305)。
 *
 * `translationStatus` に `'pending'` を含めることで、翻訳がまだ到着していない
 * 確定字幕の表示モデルを UI 層が区別できる (結果整合性、§6.2)。
 */
export type HandleTranscriptFinalOutput = Readonly<{
  sessionId: string;
  segmentId: string;
  translationStatus: 'completed' | 'failed' | 'pending';
  renderModel: OverlayRenderModel;
}>;
