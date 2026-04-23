import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import { type DomainError, validationError } from '../../domain/shared/errors';
import {
  OVERLAY_MIN_LINES,
  OVERLAY_OPACITY_BOUNDS,
  OVERLAY_POSITION_PRESETS,
} from '../../domain/specifications/overlay-settings-specification';

/**
 * BCP-47 簡易 regex (domain/session/language-pair.ts と同期)。
 */
const bcp47Schema = z.string().regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/);

const overlaySettingsPayloadSchema = z.object({
  positionPreset: z.enum(OVERLAY_POSITION_PRESETS),
  opacity: z.number().min(OVERLAY_OPACITY_BOUNDS.min).max(OVERLAY_OPACITY_BOUNDS.max),
  maxLines: z.number().int().min(OVERLAY_MIN_LINES),
  fontScale: z.number().positive(),
  showOriginalText: z.boolean(),
  showTranslatedText: z.boolean(),
});

const endpointingPolicyPayloadSchema = z.object({
  silenceThresholdMs: z.number().int().min(200).max(1200).optional(),
  punctuationAware: z.boolean().optional(),
  minUtteranceMs: z.number().int().min(100).max(3000).optional(),
});

const translationContextWindowPayloadSchema = z.object({
  maxSegments: z.number().int().min(0).max(5).optional(),
  includeTranslatedText: z.boolean().optional(),
});

export type EndpointingPolicyPayload = Readonly<{
  silenceThresholdMs?: number | undefined;
  punctuationAware?: boolean | undefined;
  minUtteranceMs?: number | undefined;
}>;

export type TranslationContextWindowPayload = Readonly<{
  maxSegments?: number | undefined;
  includeTranslatedText?: boolean | undefined;
}>;

/**
 * オーバーレイ設定更新入力 DTO (DTO-I-303, DD-303)。
 *
 * いずれのオプションも省略可能だが、何らかのフィールドが指定されない場合は
 * 更新対象なしとして UseCase 層で no-op 扱いされる。値域は
 * `domain/specifications/overlay-settings-specification.ts` の定数と同期。
 */
export type UpdateSourceSettingsInput = {
  sessionId: string;
  sourceLanguage?: string | null | undefined;
  targetLanguage?: string | undefined;
  overlaySettings?:
    | {
        positionPreset: (typeof OVERLAY_POSITION_PRESETS)[number];
        opacity: number;
        maxLines: number;
        fontScale: number;
        showOriginalText: boolean;
        showTranslatedText: boolean;
      }
    | undefined;
  endpointing?: EndpointingPolicyPayload | undefined;
  translationContext?: TranslationContextWindowPayload | undefined;
};

const updateSourceSettingsInputSchema = z.object({
  sessionId: z.string().min(1),
  sourceLanguage: bcp47Schema.nullable().optional(),
  targetLanguage: bcp47Schema.optional(),
  overlaySettings: overlaySettingsPayloadSchema.optional(),
  endpointing: endpointingPolicyPayloadSchema.optional(),
  translationContext: translationContextWindowPayloadSchema.optional(),
});

export const parseUpdateSourceSettingsInput = (
  raw: unknown,
): Result<UpdateSourceSettingsInput, DomainError> => {
  const result = updateSourceSettingsInputSchema.safeParse(raw);
  if (!result.success) {
    return err(
      validationError({
        field: 'UpdateSourceSettingsInput',
        message: result.error.issues.map((issue) => issue.message).join('; '),
      }),
    );
  }
  return ok(result.data);
};

/**
 * オーバーレイ設定更新出力 DTO (DTO-O-303)。
 */
export type UpdateSourceSettingsOutput = Readonly<{
  sessionId: string;
  appliedAt: string;
}>;
