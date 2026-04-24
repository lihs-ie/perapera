import { okAsync, type ResultAsync } from 'neverthrow';
import {
  toApplicationError,
  type ApplicationError,
} from '../application/errors/application-errors';
import { type SettingsStore } from '../application/ports/settings-store';
import { type ExportService } from '../application/services/export-service';
import { type SessionCommandService } from '../application/services/session-command-service';
import { type GetGlossaryQuery } from '../application/use-cases/get-glossary-query';
import { type GetSessionHistoryDetailQuery } from '../application/use-cases/get-session-history-detail-query';
import { type GetSessionHistoryQuery } from '../application/use-cases/get-session-history-query';
import { type GetSessionMonitorStateQuery } from '../application/use-cases/get-session-monitor-state-query';
import { type UpdateGlossaryUseCase } from '../application/use-cases/update-glossary-use-case';
import { createOverlaySettings, type OverlaySettings } from '../domain/profile/overlay-settings';
import {
  createEndpointingPolicy,
  DEFAULT_ENDPOINTING_POLICY,
  type EndpointingPolicy,
} from '../domain/session/endpointing-policy';
import { createLanguagePair, type LanguagePair } from '../domain/session/language-pair';
import {
  createTranslationContextWindow,
  DEFAULT_TRANSLATION_CONTEXT_WINDOW,
  type TranslationContextWindow,
} from '../domain/session/translation-context-window';
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
  getSessionHistoryQuery: GetSessionHistoryQuery;
  getSessionHistoryDetailQuery: GetSessionHistoryDetailQuery;
  getGlossaryQuery: GetGlossaryQuery;
  updateGlossaryUseCase: UpdateGlossaryUseCase;
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
  endpointing: Readonly<{
    silenceThresholdMs: number;
    punctuationAware: boolean;
    minUtteranceMs: number;
  }>;
  translationContext: Readonly<{
    maxSegments: number;
    includeTranslatedText: boolean;
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

  const resolveDefaultEndpointing = (): ResultAsync<EndpointingPolicy, ApplicationError> =>
    deps.settingsStore
      .getDefaultEndpointingPolicy()
      .orElse(() => okAsync(DEFAULT_ENDPOINTING_POLICY))
      .mapErr(toApplicationError);

  const resolveDefaultTranslationContext = (): ResultAsync<
    TranslationContextWindow,
    ApplicationError
  > =>
    deps.settingsStore
      .getDefaultTranslationContextWindow()
      .orElse(() => okAsync(DEFAULT_TRANSLATION_CONTEXT_WINDOW))
      .mapErr(toApplicationError);

  const toSnapshot = (params: {
    pair: LanguagePair;
    overlay: OverlaySettings;
    endpointing: EndpointingPolicy;
    translationContext: TranslationContextWindow;
    relayOverride: Readonly<{ baseUrl: string; accessToken: string }> | null;
  }): DefaultSettingsSnapshot => ({
    languagePair: { source: params.pair.source, target: params.pair.target },
    overlaySettings: {
      positionPreset: params.overlay.positionPreset,
      opacity: params.overlay.opacity,
      maxLines: params.overlay.maxLines,
      fontScale: params.overlay.fontScale,
      showOriginalText: params.overlay.showOriginalText,
      showTranslatedText: params.overlay.showTranslatedText,
    },
    endpointing: {
      silenceThresholdMs: params.endpointing.silenceThresholdMs,
      punctuationAware: params.endpointing.punctuationAware,
      minUtteranceMs: params.endpointing.minUtteranceMs,
    },
    translationContext: {
      maxSegments: params.translationContext.maxSegments,
      includeTranslatedText: params.translationContext.includeTranslatedText,
    },
    relayOverride: params.relayOverride,
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
              resolveDefaultEndpointing().andThen((endpointing) =>
                resolveDefaultTranslationContext().andThen((translationContext) =>
                  resolveRelayOverride().map((relayOverride) =>
                    toSnapshot({
                      pair,
                      overlay,
                      endpointing,
                      translationContext,
                      relayOverride,
                    }),
                  ),
                ),
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
      case 'command.save-default-endpointing-policy':
        return run(
          createEndpointingPolicy(request.input)
            .asyncAndThen((policy) => deps.settingsStore.saveDefaultEndpointingPolicy(policy))
            .mapErr(toApplicationError)
            .map(() => ({ saved: true })),
        );
      case 'command.save-default-translation-context-window':
        return run(
          createTranslationContextWindow(request.input)
            .asyncAndThen((window) =>
              deps.settingsStore.saveDefaultTranslationContextWindow(window),
            )
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
      case 'command.save-default-glossary':
        return run(deps.updateGlossaryUseCase(request.input).map(() => ({ saved: true })));
      case 'query.get-default-glossary':
        return run(deps.getGlossaryQuery());
      case 'query.get-session-history':
        return run(deps.getSessionHistoryQuery({}));
      case 'query.get-session-history-detail':
        return run(deps.getSessionHistoryDetailQuery(request.input));
    }
  };
};
