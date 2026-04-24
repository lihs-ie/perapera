import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import { type DomainError, validationError } from '../shared/errors';

/**
 * 用語集エントリの field 長制限 (DD-238)。
 */
export const GLOSSARY_ENTRY_FIELD_MAX_LENGTH = 64 as const;

/**
 * 用語集あたりの最大エントリ数 (DD-238)。
 */
export const GLOSSARY_MAX_ENTRIES = 200 as const;

const glossaryEntrySchema = z
  .object({
    source: z.string().min(1).max(GLOSSARY_ENTRY_FIELD_MAX_LENGTH),
    target: z.string().min(1).max(GLOSSARY_ENTRY_FIELD_MAX_LENGTH),
    caseSensitive: z.boolean(),
  })
  .refine((entry) => entry.source !== entry.target, {
    message: 'source and target must differ',
  })
  .brand<'GlossaryEntry'>();

/**
 * 用語集エントリ (DD-238)。翻訳時に Relay が訳出へ強制適用する原文→訳文ペア。
 */
export type GlossaryEntry = z.infer<typeof glossaryEntrySchema>;

const glossarySchema = z
  .object({
    entries: z.array(glossaryEntrySchema).max(GLOSSARY_MAX_ENTRIES),
  })
  .refine(
    (glossary) => {
      const sources = glossary.entries.map((entry) => entry.source);
      return new Set(sources).size === sources.length;
    },
    {
      message: 'glossary entries must not contain duplicate source terms',
    },
  )
  .brand<'Glossary'>();

/**
 * カスタム用語集 (DD-238)。ユーザー登録の原文→訳文ペア集合で、
 * `POST /sessions` 時に Relay へ一括送信されセッション中にメモリ保持される。
 *
 * 制約:
 * - `entries` は最大 `GLOSSARY_MAX_ENTRIES` (200) 件
 * - 各エントリの source / target は 1〜64 文字
 * - エントリ内で `source !== target`
 * - `entries` 内の source は (大文字小文字区別のうえで) 一意
 */
export type Glossary = z.infer<typeof glossarySchema>;

export const EMPTY_GLOSSARY: Glossary = glossarySchema.parse({ entries: [] });

export const createGlossaryEntry = (params: unknown): Result<GlossaryEntry, DomainError> => {
  const result = glossaryEntrySchema.safeParse(params);
  if (!result.success) {
    return err(
      validationError({
        field: 'GlossaryEntry',
        message: result.error.issues.map((issue) => issue.message).join('; '),
      }),
    );
  }
  return ok(result.data);
};

export const createGlossary = (params: unknown): Result<Glossary, DomainError> => {
  const result = glossarySchema.safeParse(params);
  if (!result.success) {
    return err(
      validationError({
        field: 'Glossary',
        message: result.error.issues.map((issue) => issue.message).join('; '),
      }),
    );
  }
  return ok(result.data);
};
