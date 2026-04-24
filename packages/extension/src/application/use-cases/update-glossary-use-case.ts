import { errAsync, type ResultAsync } from 'neverthrow';
import { createGlossary } from '../../domain/glossary';
import {
  parseUpdateGlossaryInput,
  type UpdateGlossaryInput,
  type UpdateGlossaryOutput,
} from '../dto/update-glossary-dto';
import { toApplicationError, type ApplicationError } from '../errors/application-errors';
import { type SettingsStore } from '../ports/settings-store';

export type UpdateGlossaryDependencies = Readonly<{
  settingsStore: SettingsStore;
  clock: () => string;
}>;

export type UpdateGlossaryUseCase = (
  input: UpdateGlossaryInput,
) => ResultAsync<UpdateGlossaryOutput, ApplicationError>;

/**
 * IMPL-215 UpdateGlossaryUseCase (DD-238)。
 *
 * 用語集の永続化。SettingsView から呼び出され、次に開始するセッションから
 * `POST /sessions` body の `glossary` として Relay に送信される。
 * active session には影響しない (挙動は issue #123 受入基準)。
 */
export const createUpdateGlossaryUseCase = (
  deps: UpdateGlossaryDependencies,
): UpdateGlossaryUseCase => {
  return (input) =>
    parseUpdateGlossaryInput(input)
      .asyncAndThen((parsed) => {
        const glossary = createGlossary({ entries: parsed.entries });
        if (glossary.isErr()) return errAsync(glossary.error);
        return deps.settingsStore.saveDefaultGlossary(glossary.value).map(
          (): UpdateGlossaryOutput => ({
            entryCount: glossary.value.entries.length,
            savedAt: deps.clock(),
          }),
        );
      })
      .mapErr(toApplicationError);
};
