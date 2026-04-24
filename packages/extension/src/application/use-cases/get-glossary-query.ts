import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import { EMPTY_GLOSSARY, type Glossary } from '../../domain/glossary';
import { type DomainError } from '../../domain/shared/errors';
import { type GetGlossaryOutput } from '../dto/get-glossary-dto';
import { toApplicationError, type ApplicationError } from '../errors/application-errors';
import { type SettingsStore } from '../ports/settings-store';

export type GetGlossaryDependencies = Readonly<{
  settingsStore: SettingsStore;
}>;

export type GetGlossaryQuery = () => ResultAsync<GetGlossaryOutput, ApplicationError>;

const dehydrate = (glossary: Glossary): GetGlossaryOutput => ({
  entries: glossary.entries.map((entry) => ({
    source: entry.source,
    target: entry.target,
    caseSensitive: entry.caseSensitive,
  })),
});

const recoverNotFound = (error: DomainError): ResultAsync<Glossary, DomainError> => {
  if (error.kind === 'not-found') {
    return okAsync<Glossary, DomainError>(EMPTY_GLOSSARY);
  }
  return errAsync<Glossary, DomainError>(error);
};

/**
 * IMPL-215 GetGlossaryQuery (DD-238)。
 *
 * SettingsView が読み取る現在保存済の用語集。未初期化時は空の glossary を
 * 返し、初期化済判定はリクエスト側の関心事とする (UI 側で「まだ未登録」を
 * 0 件表示として扱える)。
 */
export const createGetGlossaryQuery = (deps: GetGlossaryDependencies): GetGlossaryQuery => {
  return () =>
    deps.settingsStore
      .getDefaultGlossary()
      .orElse(recoverNotFound)
      .map(dehydrate)
      .mapErr(toApplicationError);
};
