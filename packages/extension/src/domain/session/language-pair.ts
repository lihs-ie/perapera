import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import { type DomainError, validationError } from '../shared/errors';

/**
 * BCP-47 言語タグの簡易検証。言語コード (2-3 文字小文字) + 任意の地域コード
 * (2 文字大文字) にマッチする。完全な BCP-47 サブタグ体系を網羅しない単純形式
 * だが、MVP の範囲 (en-US / ja-JP 等) では十分。
 */
const bcp47Schema = z.string().regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/);

const languagePairSchema = z
  .object({
    source: bcp47Schema,
    target: bcp47Schema,
  })
  .refine((pair) => pair.source !== pair.target, {
    message: 'source and target must differ',
  })
  .brand<'LanguagePair'>();

/**
 * ソースセッション集約 / 拡張プロファイル集約で共有される値オブジェクト (DD-232)。
 * `source` は音声ソースの入力言語、`target` は翻訳先言語。同一言語ペア禁止。
 */
export type LanguagePair = z.infer<typeof languagePairSchema>;

export const createLanguagePair = (params: unknown): Result<LanguagePair, DomainError> => {
  const result = languagePairSchema.safeParse(params);
  if (!result.success) {
    return err(
      validationError({
        field: 'LanguagePair',
        message: result.error.issues.map((issue) => issue.message).join('; '),
      }),
    );
  }
  return ok(result.data);
};
