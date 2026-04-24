import { okAsync, type ResultAsync } from 'neverthrow';
import { createOverlaySettings, type OverlaySettings } from '../../domain/profile/overlay-settings';
import { parseSessionIdentifier } from '../../domain/session/session-identifier';
import { type SourceSession } from '../../domain/session/source-session';
import { type DomainError } from '../../domain/shared/errors';
import {
  type GetSessionHistoryDetailInput,
  parseGetSessionHistoryDetailInput,
  type SessionHistoryDetailOutput,
  type SessionHistorySummary,
} from '../dto/get-session-history-dto';
import { toApplicationError, type ApplicationError } from '../errors/application-errors';
import { type SessionStore } from '../ports/session-store';
import { type SettingsStore } from '../ports/settings-store';
import { projectOverlayRenderModel } from './overlay-render-projector';

export type GetSessionHistoryDetailDependencies = Readonly<{
  sessionStore: SessionStore;
  settingsStore: SettingsStore;
}>;

export type GetSessionHistoryDetailQuery = (
  input: GetSessionHistoryDetailInput,
) => ResultAsync<SessionHistoryDetailOutput, ApplicationError>;

const summarize = (session: SourceSession): SessionHistorySummary => {
  const startedAtMs = new Date(session.startedAt).getTime();
  const stoppedAtMs = session.stoppedAt === null ? null : new Date(session.stoppedAt).getTime();
  const durationMs =
    stoppedAtMs !== null && Number.isFinite(stoppedAtMs - startedAtMs)
      ? Math.max(0, stoppedAtMs - startedAtMs)
      : null;
  return {
    sessionId: session.sessionIdentifier,
    displayName: session.sessionIdentifier,
    sourceType: session.sourceType,
    state: session.state,
    sourceLanguage: session.languagePair.source,
    targetLanguage: session.languagePair.target,
    startedAt: session.startedAt,
    stoppedAt: session.stoppedAt,
    durationMs,
  };
};

const HISTORY_FALLBACK_SETTINGS: OverlaySettings = createOverlaySettings({
  positionPreset: 'bottom',
  opacity: 0.8,
  maxLines: 200,
  fontScale: 1,
  showOriginalText: true,
  showTranslatedText: true,
})._unsafeUnwrap();

const resolveSettings = (settingsStore: SettingsStore): ResultAsync<OverlaySettings, DomainError> =>
  settingsStore.getDefaultOverlaySettings().orElse(() => okAsync(HISTORY_FALLBACK_SETTINGS));

/**
 * Issue #109 GetSessionHistoryDetailQuery (新規)。
 *
 * `SessionStore.loadExportBundle` で session + transcript stream を取得し、
 * `projectOverlayRenderModel` で `OverlayLine[]` に投影する。`maxLines` は
 * 履歴用の大きな値 (最低 200) で読み込み、UI 側で全文確認できるようにする。
 *
 * settings 取得失敗 (未初期化) は内部既定値 `HISTORY_FALLBACK_SETTINGS` で
 * fallback する。
 */
export const createGetSessionHistoryDetailQuery = (
  deps: GetSessionHistoryDetailDependencies,
): GetSessionHistoryDetailQuery => {
  return (input) =>
    parseGetSessionHistoryDetailInput(input)
      .asyncAndThen((parsed) =>
        parseSessionIdentifier(parsed.sessionId).asyncAndThen((sessionIdentifier) =>
          deps.sessionStore.loadExportBundle(sessionIdentifier).andThen((bundle) =>
            resolveSettings(deps.settingsStore).map((settings): SessionHistoryDetailOutput => {
              const cappedSettings = createOverlaySettings({
                positionPreset: settings.positionPreset,
                opacity: settings.opacity,
                maxLines: Math.max(settings.maxLines, 200),
                fontScale: settings.fontScale,
                showOriginalText: settings.showOriginalText,
                showTranslatedText: settings.showTranslatedText,
              });
              const finalSettings = cappedSettings.isOk()
                ? cappedSettings.value
                : HISTORY_FALLBACK_SETTINGS;
              const renderModel = projectOverlayRenderModel({
                stream: bundle.stream,
                settings: finalSettings,
              });
              return {
                summary: summarize(bundle.session),
                lines: renderModel.lines,
              };
            }),
          ),
        ),
      )
      .mapErr(toApplicationError);
};
