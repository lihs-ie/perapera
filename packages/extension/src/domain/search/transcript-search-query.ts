import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import { type DomainError, validationError } from '../shared/errors';

export const SEARCH_KEYWORD_MIN_LENGTH = 1 as const;
export const SEARCH_KEYWORD_MAX_LENGTH = 256 as const;

export const TRANSCRIPT_SEARCH_LANGUAGES = ['source', 'target', 'both'] as const;
export type TranscriptSearchLanguage = (typeof TRANSCRIPT_SEARCH_LANGUAGES)[number];

const transcriptSearchQuerySchema = z
  .object({
    keyword: z.string().min(SEARCH_KEYWORD_MIN_LENGTH).max(SEARCH_KEYWORD_MAX_LENGTH),
    language: z.enum(TRANSCRIPT_SEARCH_LANGUAGES),
    caseSensitive: z.boolean(),
  })
  .brand<'TranscriptSearchQuery'>();

/**
 * 字幕検索クエリ (DD-261, Issue #125)。
 *
 * セッション履歴画面の全文検索で使用する。`keyword` は 1〜256 文字。
 * `language` で原文のみ / 訳文のみ / 両方を切替。`caseSensitive` は正規表現の
 * 大文字小文字区別。
 */
export type TranscriptSearchQuery = z.infer<typeof transcriptSearchQuerySchema>;

export const createTranscriptSearchQuery = (
  params: unknown,
): Result<TranscriptSearchQuery, DomainError> => {
  const result = transcriptSearchQuerySchema.safeParse(params);
  if (!result.success) {
    return err(
      validationError({
        field: 'TranscriptSearchQuery',
        message: result.error.issues.map((issue) => issue.message).join('; '),
      }),
    );
  }
  return ok(result.data);
};
