import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import { type DomainError, validationError } from '../shared/errors';

/**
 * 翻訳文脈窓 (DD-237)。
 *
 * 翻訳プロバイダに直前 N 個の確定字幕を文脈として送信するためのポリシー
 * (REQ-NF-019)。`maxSegments=0` は context を渡さない従来挙動と等価。
 *
 * - `maxSegments`: 0〜5、既定 3
 * - `includeTranslatedText`: 既定 true。context に訳済みテキストも含めるか
 */
const translationContextWindowSchema = z
  .object({
    maxSegments: z.number().int().min(0).max(5),
    includeTranslatedText: z.boolean(),
  })
  .brand<'TranslationContextWindow'>();

export type TranslationContextWindow = z.infer<typeof translationContextWindowSchema>;

export const DEFAULT_TRANSLATION_CONTEXT_WINDOW: TranslationContextWindow =
  translationContextWindowSchema.parse({
    maxSegments: 3,
    includeTranslatedText: true,
  });

export const createTranslationContextWindow = (
  params: unknown,
): Result<TranslationContextWindow, DomainError> => {
  const result = translationContextWindowSchema.safeParse(params);
  if (!result.success) {
    return err(
      validationError({
        field: 'TranslationContextWindow',
        message: result.error.issues.map((issue) => issue.message).join('; '),
      }),
    );
  }
  return ok(result.data);
};
