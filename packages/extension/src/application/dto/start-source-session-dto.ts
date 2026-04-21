import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import { SOURCE_TYPES } from '../../domain/session/source-type';
import { type DomainError, validationError } from '../../domain/shared/errors';

const bcp47Schema = z.string().regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/);

const overlayTargetSchema = z.object({
  kind: z.enum(['tab', 'extension-monitor']),
  tabId: z.number().int().nonnegative().optional(),
  pageId: z.string().min(1).optional(),
});

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
};

const startSourceSessionInputSchema = z.object({
  sourceType: z.enum(SOURCE_TYPES),
  displayName: z.string().min(1),
  sourceLanguage: bcp47Schema.nullable().optional(),
  autoDetectLanguage: z.boolean(),
  targetLanguage: bcp47Schema,
  overlayTarget: overlayTargetSchema,
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
