import { okAsync, type ResultAsync } from 'neverthrow';
import {
  toApplicationError,
  type ApplicationError,
} from '../application/errors/application-errors';
import { type SettingsStore } from '../application/ports/settings-store';
import { type ExportService } from '../application/services/export-service';
import { type SessionCommandService } from '../application/services/session-command-service';
import { type GetSessionMonitorStateQuery } from '../application/use-cases/get-session-monitor-state-query';
import { createOverlaySettings, type OverlaySettings } from '../domain/profile/overlay-settings';
import { createLanguagePair, type LanguagePair } from '../domain/session/language-pair';
import { parseBackgroundRequest, type BackgroundResponse } from './runtime-messages';

/**
 * IMPL-502 Runtime message dispatcher。
 *
 * chrome.runtime.onMessage に登録する handler。`BackgroundRequest` を
 * discriminated union で分岐し、対応する application facade に dispatch する。
 *
 * **本番実装で mock / in-memory を使わない設計**:
 * - `SessionCommandService` / `ExportService` / `GetSessionMonitorStateQuery` /
 *   `SettingsStore` は **必須 DI** (default なし)
 * - production entrypoint (`background.ts`) で `createExtensionApp` が返した
 *   全 facade を明示的に渡す
 */
export type RuntimeDispatcherDependencies = Readonly<{
  sessionCommandService: SessionCommandService;
  exportService: ExportService;
  getSessionMonitorStateQuery: GetSessionMonitorStateQuery;
  settingsStore: SettingsStore;
}>;

/**
 * Response は chrome.runtime.sendMessage のペイロードとして JSON serialize
 * されるため、dispatcher 側は UseCase output DTO をそのまま包んで返す。
 * UI 側 (popup / sidepanel) は request.type ごとに value の shape を
 * type-narrow する (presentation 層で改めて schema 検証)。
 */
export type RuntimeDispatcher = (raw: unknown) => Promise<BackgroundResponse<unknown>>;

const toOk = (value: unknown): BackgroundResponse<unknown> => ({ ok: true, value });
const toErr = (error: ApplicationError): BackgroundResponse<unknown> => ({ ok: false, error });

const run = async (promise: ResultAsync<unknown, ApplicationError>) => {
  const result = await promise;
  return result.match(toOk, toErr);
};

/**
 * 未保存時の build-time fallback。`handle-transcript-*-use-case` / overlay-render
 * projector と同じ値を使用する (DD-234)。
 */
const DEFAULT_LANGUAGE_PAIR_SOURCE = 'en-US';
const DEFAULT_LANGUAGE_PAIR_TARGET = 'ja-JP';
const DEFAULT_OVERLAY_SETTINGS = {
  positionPreset: 'bottom',
  opacity: 0.8,
  maxLines: 2,
  fontScale: 1,
  showOriginalText: true,
  showTranslatedText: true,
} as const;

const buildDefaultLanguagePair = (): LanguagePair =>
  createLanguagePair({
    source: DEFAULT_LANGUAGE_PAIR_SOURCE,
    target: DEFAULT_LANGUAGE_PAIR_TARGET,
  })._unsafeUnwrap();

const buildDefaultOverlaySettings = (): OverlaySettings =>
  createOverlaySettings(DEFAULT_OVERLAY_SETTINGS)._unsafeUnwrap();

type DefaultSettingsSnapshot = Readonly<{
  languagePair: Readonly<{ source: string; target: string }>;
  overlaySettings: Readonly<{
    positionPreset: OverlaySettings['positionPreset'];
    opacity: number;
    maxLines: number;
    fontScale: number;
    showOriginalText: boolean;
    showTranslatedText: boolean;
  }>;
  relayOverride: Readonly<{ baseUrl: string; accessToken: string }> | null;
}>;

/**
 * `createRuntimeDispatcher(deps)(rawMessage)` 形式で呼び出す。
 * return 値は単一 `BackgroundResponse<unknown>`。chrome.runtime.onMessage の
 * sendResponse にそのまま渡せる。
 */
export const createRuntimeDispatcher = (deps: RuntimeDispatcherDependencies): RuntimeDispatcher => {
  const resolveDefaultLanguagePair = (): ResultAsync<LanguagePair, ApplicationError> =>
    deps.settingsStore
      .getDefaultLanguagePair()
      .orElse(() => okAsync(buildDefaultLanguagePair()))
      .mapErr(toApplicationError);

  const resolveDefaultOverlaySettings = (): ResultAsync<OverlaySettings, ApplicationError> =>
    deps.settingsStore
      .getDefaultOverlaySettings()
      .orElse(() => okAsync(buildDefaultOverlaySettings()))
      .mapErr(toApplicationError);

  const resolveRelayOverride = (): ResultAsync<
    Readonly<{ baseUrl: string; accessToken: string }> | null,
    ApplicationError
  > =>
    deps.settingsStore
      .getRelayConnectionOverride()
      .orElse(() => okAsync(null))
      .mapErr(toApplicationError);

  const toSnapshot = (
    pair: LanguagePair,
    overlay: OverlaySettings,
    relayOverride: Readonly<{ baseUrl: string; accessToken: string }> | null,
  ): DefaultSettingsSnapshot => ({
    languagePair: { source: pair.source, target: pair.target },
    overlaySettings: {
      positionPreset: overlay.positionPreset,
      opacity: overlay.opacity,
      maxLines: overlay.maxLines,
      fontScale: overlay.fontScale,
      showOriginalText: overlay.showOriginalText,
      showTranslatedText: overlay.showTranslatedText,
    },
    relayOverride,
  });

  return async (raw) => {
    const parseResult = parseBackgroundRequest(raw).mapErr(toApplicationError);
    if (parseResult.isErr()) {
      return toErr(parseResult.error);
    }
    const request = parseResult.value;
    switch (request.type) {
      case 'command.start-source-session':
        return run(deps.sessionCommandService.startSource(request.input));
      case 'command.stop-source-session':
        return run(deps.sessionCommandService.stopSource(request.input));
      case 'command.update-source-settings':
        return run(deps.sessionCommandService.applySourceSettings(request.input));
      case 'command.export-session-result':
        return run(deps.exportService.export(request.input));
      case 'query.get-session-monitor-state':
        return run(deps.getSessionMonitorStateQuery(request.input));
      case 'query.get-default-settings':
        return run(
          resolveDefaultLanguagePair().andThen((pair) =>
            resolveDefaultOverlaySettings().andThen((overlay) =>
              resolveRelayOverride().map((relayOverride) =>
                toSnapshot(pair, overlay, relayOverride),
              ),
            ),
          ),
        );
      case 'command.save-default-language-pair':
        return run(
          createLanguagePair(request.input)
            .asyncAndThen((pair) => deps.settingsStore.saveDefaultLanguagePair(pair))
            .mapErr(toApplicationError)
            .map(() => ({ saved: true })),
        );
      case 'command.save-default-overlay-settings':
        return run(
          createOverlaySettings(request.input)
            .asyncAndThen((settings) => deps.settingsStore.saveDefaultOverlaySettings(settings))
            .mapErr(toApplicationError)
            .map(() => ({ saved: true })),
        );
      case 'command.save-relay-connection-override':
        return run(
          deps.settingsStore
            .saveRelayConnectionOverride({
              baseUrl: request.input.baseUrl,
              accessToken: request.input.accessToken,
            })
            .mapErr(toApplicationError)
            .map(() => ({ saved: true })),
        );
      case 'command.clear-relay-connection-override':
        return run(
          deps.settingsStore
            .clearRelayConnectionOverride()
            .mapErr(toApplicationError)
            .map(() => ({ saved: true })),
        );
    }
  };
};
