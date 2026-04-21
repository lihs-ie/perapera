import { okAsync, type ResultAsync } from 'neverthrow';
import { createOverlaySettings } from '../../domain/profile/overlay-settings';
import { type SourceSessionRepository } from '../../domain/repositories/source-session-repository';
import { createLanguagePair } from '../../domain/session/language-pair';
import { parseSessionIdentifier } from '../../domain/session/session-identifier';
import { type SourceSession } from '../../domain/session/source-session';
import { describeDomainError, type DomainError } from '../../domain/shared/errors';
import {
  parseUpdateSourceSettingsInput,
  type UpdateSourceSettingsInput,
  type UpdateSourceSettingsOutput,
} from '../dto/update-source-settings-dto';
import { toApplicationError, type ApplicationError } from '../errors/application-errors';
import { type OverlayPresenter } from '../ports/overlay-presenter';

export type UpdateSourceSettingsDependencies = Readonly<{
  sourceSessionRepository: SourceSessionRepository;
  overlayPresenter: OverlayPresenter;
  clock: () => string;
}>;

export type UpdateSourceSettingsUseCase = (
  input: UpdateSourceSettingsInput,
) => ResultAsync<UpdateSourceSettingsOutput, ApplicationError>;

const logWarn = (scope: string) => (error: DomainError) => {
  console.warn(`[use-case:update-source-settings] ${scope} failed:`, describeDomainError(error));
};

/**
 * IMPL-212 UpdateSourceSettingsUseCase (DD-303)。
 *
 * 利用者が明示的に設定を変更する際の UseCase。
 * - `sourceLanguage` / `targetLanguage` が指定されれば、対応する `LanguagePair`
 *   を更新し、session を永続化
 * - `overlaySettings` が指定されれば `OverlayPresenter.updateSettings` に伝達
 *   (fire-and-forget)。両者とも省略された場合は no-op
 */
export const createUpdateSourceSettingsUseCase = (
  deps: UpdateSourceSettingsDependencies,
): UpdateSourceSettingsUseCase => {
  return (input) =>
    parseUpdateSourceSettingsInput(input)
      .asyncAndThen((parsed) =>
        parseSessionIdentifier(parsed.sessionId).asyncAndThen((sessionIdentifier) =>
          deps.sourceSessionRepository.findById(sessionIdentifier).andThen((session) => {
            const hasSourceLanguage =
              parsed.sourceLanguage !== undefined && parsed.sourceLanguage !== null;
            const needsLanguageUpdate = hasSourceLanguage || parsed.targetLanguage !== undefined;
            const savePromise: ResultAsync<SourceSession, DomainError> = needsLanguageUpdate
              ? (() => {
                  const nextSource = parsed.sourceLanguage ?? session.languagePair.source;
                  const nextTarget = parsed.targetLanguage ?? session.languagePair.target;
                  return createLanguagePair({
                    source: nextSource,
                    target: nextTarget,
                  })
                    .map((languagePair) => ({ ...session, languagePair }))
                    .asyncAndThen((updated) =>
                      deps.sourceSessionRepository.save(updated).map(() => updated),
                    );
                })()
              : okAsync(session);

            return savePromise.map((saved) => {
              if (parsed.overlaySettings !== undefined) {
                const overlayResult = createOverlaySettings(parsed.overlaySettings);
                if (overlayResult.isOk()) {
                  void deps.overlayPresenter
                    .updateSettings(sessionIdentifier, overlayResult.value)
                    .match(() => undefined, logWarn('overlayPresenter.updateSettings'));
                } else {
                  logWarn('createOverlaySettings')(overlayResult.error);
                }
              }
              const output: UpdateSourceSettingsOutput = {
                sessionId: saved.sessionIdentifier,
                appliedAt: deps.clock(),
              };
              return output;
            });
          }),
        ),
      )
      .mapErr(toApplicationError);
};
