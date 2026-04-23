import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import { type DomainError, validationError } from '../shared/errors';

/**
 * 翻訳文脈窓 (DD-237, API-002 payload)。
 *
 * 翻訳プロバイダに直前 N 個の確定字幕を文脈として送信するための Relay 側
 * 値オブジェクト。`maxSegments=0` は context を渡さない従来挙動と等価。
 *
 * IMPL-460 (opt-in, hold-window): `holdWindowMs` を 0..150 の範囲で指定すると、
 * 新 final 受信時にその時間だけ翻訳発火を遅延させ、間に別 final が届いたら
 * テキストを結合して 1 回の translate() に統合する (Option B feature flag)。
 * 既定は 0 (無効、従来挙動)。150ms を上限にするのはホットパス SLO 800ms の
 * 内枠を食い過ぎないため。
 */
const translationContextWindowSchema = z
  .object({
    maxSegments: z.number().int().min(0).max(5),
    includeTranslatedText: z.boolean(),
    holdWindowMs: z.number().int().min(0).max(150),
  })
  .brand<'RelayTranslationContextWindow'>();

export type TranslationContextWindow = z.infer<typeof translationContextWindowSchema>;

export const DEFAULT_TRANSLATION_CONTEXT_WINDOW: TranslationContextWindow =
  translationContextWindowSchema.parse({
    maxSegments: 3,
    includeTranslatedText: true,
    holdWindowMs: 0,
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

export const mergeTranslationContextWindow = (
  defaults: TranslationContextWindow,
  override?: {
    maxSegments?: number | undefined;
    includeTranslatedText?: boolean | undefined;
    holdWindowMs?: number | undefined;
  },
): Result<TranslationContextWindow, DomainError> =>
  createTranslationContextWindow({
    maxSegments: override?.maxSegments ?? defaults.maxSegments,
    includeTranslatedText: override?.includeTranslatedText ?? defaults.includeTranslatedText,
    holdWindowMs: override?.holdWindowMs ?? defaults.holdWindowMs,
  });
