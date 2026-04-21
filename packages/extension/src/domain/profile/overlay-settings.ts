import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import { type DomainError, validationError } from '../shared/errors';

/**
 * 翻訳オーバーレイの表示設定 (DD-234)。
 * - `positionPreset`: 表示位置 (上 / 下 / 浮動)
 * - `opacity`: 0.0-1.0 (完全透過〜完全不透明)
 * - `maxLines`: 1 以上の整数
 * - `fontScale`: 正の実数
 * - `showOriginalText` / `showTranslatedText`: 少なくとも 1 つは true
 *   (両方 false だと何も表示されないため不変条件として禁止)
 */
const overlaySettingsSchema = z
  .object({
    positionPreset: z.enum(['top', 'bottom', 'floating']),
    opacity: z.number().min(0).max(1),
    maxLines: z.number().int().min(1),
    fontScale: z.number().positive(),
    showOriginalText: z.boolean(),
    showTranslatedText: z.boolean(),
  })
  .refine((settings) => settings.showOriginalText || settings.showTranslatedText, {
    message: 'at least one of showOriginalText / showTranslatedText must be true',
  })
  .brand<'OverlaySettings'>();

export type OverlaySettings = z.infer<typeof overlaySettingsSchema>;

export const createOverlaySettings = (params: unknown): Result<OverlaySettings, DomainError> => {
  const result = overlaySettingsSchema.safeParse(params);
  if (!result.success) {
    return err(
      validationError({
        field: 'OverlaySettings',
        message: result.error.issues.map((issue) => issue.message).join('; '),
      }),
    );
  }
  return ok(result.data);
};
