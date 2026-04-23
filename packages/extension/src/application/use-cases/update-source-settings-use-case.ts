import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import { createOverlaySettings } from '../../domain/profile/overlay-settings';
import { type SourceSessionRepository } from '../../domain/repositories/source-session-repository';
import { createEndpointingPolicy } from '../../domain/session/endpointing-policy';
import { createLanguagePair } from '../../domain/session/language-pair';
import { parseSessionIdentifier } from '../../domain/session/session-identifier';
import {
  type SourceSession,
  updateSourceSessionEndpointing,
  updateSourceSessionTranslationContext,
} from '../../domain/session/source-session';
import { createTranslationContextWindow } from '../../domain/session/translation-context-window';
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

type Parsed = UpdateSourceSettingsInput;

const applyLanguageUpdate = (
  session: SourceSession,
  parsed: Parsed,
): ResultAsync<SourceSession, DomainError> => {
  const hasSource = parsed.sourceLanguage !== undefined && parsed.sourceLanguage !== null;
  if (!hasSource && parsed.targetLanguage === undefined) return okAsync(session);

  const nextSource = parsed.sourceLanguage ?? session.languagePair.source;
  const nextTarget = parsed.targetLanguage ?? session.languagePair.target;
  const pair = createLanguagePair({ source: nextSource, target: nextTarget });
  if (pair.isErr()) return errAsync(pair.error);
  return okAsync({ ...session, languagePair: pair.value });
};

const applyEndpointingUpdate = (
  session: SourceSession,
  parsed: Parsed,
): ResultAsync<SourceSession, DomainError> => {
  if (parsed.endpointing === undefined) return okAsync(session);
  const policy = createEndpointingPolicy({
    silenceThresholdMs:
      parsed.endpointing.silenceThresholdMs ?? session.endpointing.silenceThresholdMs,
    punctuationAware: parsed.endpointing.punctuationAware ?? session.endpointing.punctuationAware,
    minUtteranceMs: parsed.endpointing.minUtteranceMs ?? session.endpointing.minUtteranceMs,
  });
  if (policy.isErr()) return errAsync(policy.error);
  const updated = updateSourceSessionEndpointing(session, policy.value);
  return updated.isOk() ? okAsync(updated.value) : errAsync(updated.error);
};

const applyTranslationContextUpdate = (
  session: SourceSession,
  parsed: Parsed,
): ResultAsync<SourceSession, DomainError> => {
  if (parsed.translationContext === undefined) return okAsync(session);
  const window = createTranslationContextWindow({
    maxSegments: parsed.translationContext.maxSegments ?? session.translationContext.maxSegments,
    includeTranslatedText:
      parsed.translationContext.includeTranslatedText ??
      session.translationContext.includeTranslatedText,
  });
  if (window.isErr()) return errAsync(window.error);
  const updated = updateSourceSessionTranslationContext(session, window.value);
  return updated.isOk() ? okAsync(updated.value) : errAsync(updated.error);
};

const needsPersist = (parsed: Parsed): boolean =>
  (parsed.sourceLanguage !== undefined && parsed.sourceLanguage !== null) ||
  parsed.targetLanguage !== undefined ||
  parsed.endpointing !== undefined ||
  parsed.translationContext !== undefined;

/**
 * IMPL-212 UpdateSourceSettingsUseCase (DD-303)。
 *
 * 利用者が明示的に設定を変更する際の UseCase。
 * - `sourceLanguage` / `targetLanguage` が指定されれば `LanguagePair` を更新
 * - `endpointing` が指定されれば `EndpointingPolicy` を差分更新 (REQ-NF-018)
 * - `translationContext` が指定されれば `TranslationContextWindow` を差分更新 (REQ-NF-019)
 * - いずれかを更新した場合は session を永続化 (fire-and-forget ではなく待つ:
 *   利用者起点の設定変更は「保存された」応答を返す必要がある)
 * - `overlaySettings` が指定されれば `OverlayPresenter.updateSettings` に fire-and-forget
 */
export const createUpdateSourceSettingsUseCase = (
  deps: UpdateSourceSettingsDependencies,
): UpdateSourceSettingsUseCase => {
  return (input) =>
    parseUpdateSourceSettingsInput(input)
      .asyncAndThen((parsed) =>
        parseSessionIdentifier(parsed.sessionId).asyncAndThen((sessionIdentifier) =>
          deps.sourceSessionRepository.findById(sessionIdentifier).andThen((session) => {
            const saveChain: ResultAsync<SourceSession, DomainError> = needsPersist(parsed)
              ? applyLanguageUpdate(session, parsed)
                  .andThen((next) => applyEndpointingUpdate(next, parsed))
                  .andThen((next) => applyTranslationContextUpdate(next, parsed))
                  .andThen((updated) =>
                    deps.sourceSessionRepository.save(updated).map(() => updated),
                  )
              : okAsync(session);

            return saveChain.map((saved) => {
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
