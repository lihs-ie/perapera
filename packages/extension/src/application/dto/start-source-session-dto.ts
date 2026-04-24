import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import { GLOSSARY_ENTRY_FIELD_MAX_LENGTH, GLOSSARY_MAX_ENTRIES } from '../../domain/glossary';
import { SOURCE_TYPES } from '../../domain/session/source-type';
import { type DomainError, validationError } from '../../domain/shared/errors';

const bcp47Schema = z.string().regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/);

const overlayTargetSchema = z.object({
  kind: z.enum(['tab', 'extension-monitor']),
  tabId: z.number().int().nonnegative().optional(),
  pageId: z.string().min(1).optional(),
});

const glossaryEntryInputSchema = z.object({
  source: z.string().min(1).max(GLOSSARY_ENTRY_FIELD_MAX_LENGTH),
  target: z.string().min(1).max(GLOSSARY_ENTRY_FIELD_MAX_LENGTH),
  caseSensitive: z.boolean(),
});

const glossaryInputSchema = z
  .object({
    entries: z.array(glossaryEntryInputSchema).max(GLOSSARY_MAX_ENTRIES),
  })
  .optional();

/**
 * エンドポインティング方針 (REQ-NF-018) と翻訳文脈窓 (REQ-NF-019) の入力
 * サブスキーマ。いずれの個別フィールドも省略可能で、未指定ならプロファイル
 * 既定または VO 既定値を適用する。
 */
const endpointingPolicyInputSchema = z
  .object({
    silenceThresholdMs: z.number().int().min(200).max(1200).optional(),
    punctuationAware: z.boolean().optional(),
    minUtteranceMs: z.number().int().min(100).max(3000).optional(),
  })
  .optional();

const translationContextWindowInputSchema = z
  .object({
    maxSegments: z.number().int().min(0).max(5).optional(),
    includeTranslatedText: z.boolean().optional(),
  })
  .optional();

export type EndpointingPolicyInput = Readonly<{
  silenceThresholdMs?: number | undefined;
  punctuationAware?: boolean | undefined;
  minUtteranceMs?: number | undefined;
}>;

export type TranslationContextWindowInput = Readonly<{
  maxSegments?: number | undefined;
  includeTranslatedText?: boolean | undefined;
}>;

export type GlossaryInput = Readonly<{
  entries: readonly {
    source: string;
    target: string;
    caseSensitive: boolean;
  }[];
}>;

/**
 * セッション開始入力 DTO (DTO-I-301, DD-301)。
 *
 * Popup / Side Panel の「ソース追加」操作から UseCase 層に渡される境界型。
 * `sourceType` は `SOURCE_TYPES` と同期。`sourceLanguage` は `null` で
 * 自動判定をリセット、`autoDetectLanguage` は別フラグで ON/OFF を管理する。
 * `overlayTarget` は overlay の表示先 (タブ or 拡張 monitor ページ) を指定。
 */
export type StartSourceSessionInput = {
  sourceType: (typeof SOURCE_TYPES)[number];
  displayName: string;
  sourceLanguage?: string | null | undefined;
  autoDetectLanguage: boolean;
  targetLanguage: string;
  overlayTarget: {
    kind: 'tab' | 'extension-monitor';
    tabId?: number | undefined;
    pageId?: string | undefined;
  };
  endpointing?: EndpointingPolicyInput | undefined;
  translationContext?: TranslationContextWindowInput | undefined;
  glossary?: GlossaryInput | undefined;
};

const startSourceSessionInputSchema = z.object({
  sourceType: z.enum(SOURCE_TYPES),
  displayName: z.string().min(1),
  sourceLanguage: bcp47Schema.nullable().optional(),
  autoDetectLanguage: z.boolean(),
  targetLanguage: bcp47Schema,
  overlayTarget: overlayTargetSchema,
  endpointing: endpointingPolicyInputSchema,
  translationContext: translationContextWindowInputSchema,
  glossary: glossaryInputSchema,
});

export const parseStartSourceSessionInput = (
  raw: unknown,
): Result<StartSourceSessionInput, DomainError> => {
  const result = startSourceSessionInputSchema.safeParse(raw);
  if (!result.success) {
    return err(
      validationError({
        field: 'StartSourceSessionInput',
        message: result.error.issues.map((issue) => issue.message).join('; '),
      }),
    );
  }
  return ok(result.data);
};

/**
 * セッション開始出力 DTO (DTO-O-301)。
 * `SourceSession` から `sessionId` / `state` / `startedAt` を primitive 化。
 */
export type StartSourceSessionOutput = Readonly<{
  sessionId: string;
  state: string;
  startedAt: string;
}>;
