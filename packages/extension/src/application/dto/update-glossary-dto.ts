import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import { GLOSSARY_ENTRY_FIELD_MAX_LENGTH, GLOSSARY_MAX_ENTRIES } from '../../domain/glossary';
import { type DomainError, validationError } from '../../domain/shared/errors';

const glossaryEntryPayloadSchema = z.object({
  source: z.string().min(1).max(GLOSSARY_ENTRY_FIELD_MAX_LENGTH),
  target: z.string().min(1).max(GLOSSARY_ENTRY_FIELD_MAX_LENGTH),
  caseSensitive: z.boolean(),
});

const updateGlossaryInputSchema = z.object({
  entries: z.array(glossaryEntryPayloadSchema).max(GLOSSARY_MAX_ENTRIES),
});

/**
 * 用語集更新入力 DTO (DTO-I-304, DD-238)。
 *
 * SettingsView / background 間の `chrome.runtime.sendMessage` で渡すため、
 * branded `Glossary` ではなく primitive 配列として受ける。UseCase 内で
 * `createGlossary` を通してドメイン不変条件を満たしてから SettingsStore へ
 * 書き込む。
 */
export type UpdateGlossaryInput = Readonly<{
  entries: readonly {
    source: string;
    target: string;
    caseSensitive: boolean;
  }[];
}>;

export const parseUpdateGlossaryInput = (
  raw: unknown,
): Result<UpdateGlossaryInput, DomainError> => {
  const result = updateGlossaryInputSchema.safeParse(raw);
  if (!result.success) {
    return err(
      validationError({
        field: 'UpdateGlossaryInput',
        message: result.error.issues.map((issue) => issue.message).join('; '),
      }),
    );
  }
  return ok(result.data);
};

/**
 * 用語集更新出力 DTO (DTO-O-304)。保存完了時刻のみ返す。
 */
export type UpdateGlossaryOutput = Readonly<{
  entryCount: number;
  savedAt: string;
}>;
