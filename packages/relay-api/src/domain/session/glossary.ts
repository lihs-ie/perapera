import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import { type DomainError, validationError } from '../shared/errors';

/**
 * 用語集エントリの field 長制限 (DD-238、extension 側と同期)。
 */
export const GLOSSARY_ENTRY_FIELD_MAX_LENGTH = 64 as const;

/**
 * 用語集あたりの最大エントリ数 (DD-238、extension 側と同期)。
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
  });

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
  );

/**
 * Relay 側 Glossary 値オブジェクト (DD-238)。
 *
 * `POST /sessions` body の `glossary` から生成され、session 全体を通じて
 * セッション寿命中メモリ上に保持される。`TranslationPort` の request に添えて
 * プロバイダが LLM system prompt / 後処理置換で利用する。
 */
export type Glossary = z.infer<typeof glossarySchema>;

export const EMPTY_GLOSSARY: Glossary = glossarySchema.parse({ entries: [] });

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
