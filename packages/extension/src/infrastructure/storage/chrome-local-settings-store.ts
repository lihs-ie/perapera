import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import { z } from 'zod';
import { createOverlaySettings, type OverlaySettings } from '../../domain/profile/overlay-settings';
import {
  createEndpointingPolicy,
  type EndpointingPolicy,
} from '../../domain/session/endpointing-policy';
import { createLanguagePair, type LanguagePair } from '../../domain/session/language-pair';
import {
  createTranslationContextWindow,
  type TranslationContextWindow,
} from '../../domain/session/translation-context-window';
import {
  describeDomainError,
  invariantViolationError,
  notFoundError,
  validationError,
  type DomainError,
} from '../../domain/shared/errors';
import {
  type RelayConnectionOverride,
  type SettingsStore,
} from '../../application/ports/settings-store';

const LANGUAGE_KEY = 'settings.language.defaultLanguagePair';
const OVERLAY_KEY = 'settings.overlay.defaultOverlaySettings';
const STT_KEY = 'settings.stt.defaultEndpointingPolicy';
const TRANSLATION_KEY = 'settings.translation.defaultContextWindow';
const RELAY_OVERRIDE_KEY = 'settings.relay.connectionOverride';

const relayOverrideSchema = z.object({
  baseUrl: z.string().url('baseUrl must be a valid URL'),
  accessToken: z.string().min(16, 'accessToken must be at least 16 chars'),
});

/**
 * chrome.storage.local の overload を隠蔽した最小 adapter。
 * テストでは直接 mock 実装を注入できる。production では `chrome.storage.local`
 * を呼ぶ default 実装を使う。
 */
export type ChromeStorageAdapter = Readonly<{
  get: (keys: readonly string[]) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  remove: (keys: readonly string[]) => Promise<void>;
}>;

export const defaultChromeStorageAdapter: ChromeStorageAdapter = {
  get: async (keys) => {
    const items: Record<string, unknown> = await chrome.storage.local.get([...keys]);
    return items;
  },
  set: async (items) => {
    await chrome.storage.local.set(items);
  },
  remove: async (keys) => {
    await chrome.storage.local.remove([...keys]);
  },
};

const toPersistenceError =
  (scope: string) =>
  (cause: unknown): DomainError =>
    invariantViolationError({
      invariant: 'chrome-storage-access',
      details: `${scope}: ${cause instanceof Error ? cause.message : 'unknown error'}`,
    });

const readRaw = (adapter: ChromeStorageAdapter, key: string): ResultAsync<unknown, DomainError> =>
  ResultAsync.fromPromise(adapter.get([key]), toPersistenceError(`get ${key}`)).map(
    (items) => items[key],
  );

const writeRaw = (
  adapter: ChromeStorageAdapter,
  key: string,
  value: unknown,
): ResultAsync<void, DomainError> =>
  ResultAsync.fromPromise(adapter.set({ [key]: value }), toPersistenceError(`set ${key}`));

const removeRaw = (adapter: ChromeStorageAdapter, key: string): ResultAsync<void, DomainError> =>
  ResultAsync.fromPromise(adapter.remove([key]), toPersistenceError(`remove ${key}`));

/**
 * IMPL-311 ChromeLocalSettingsStore (DD-107, DB-005)。
 *
 * `chrome.storage.local` に拡張の既定値を保存・復元する `SettingsStore`
 * 実装。キーは階層的命名 (`settings.language.*` / `settings.overlay.*`)。
 *
 * エラー:
 * - 未初期化 (`key === undefined`): `notFoundError`
 * - Zod スキーマ違反: `validationError` (VO factory から propagate)
 * - chrome.storage I/O 失敗: `invariantViolationError({ invariant:
 *   'chrome-storage-access' })`
 */
export const createChromeLocalSettingsStore = (adapter: ChromeStorageAdapter): SettingsStore => {
  return {
    getDefaultLanguagePair: () =>
      readRaw(adapter, LANGUAGE_KEY).andThen((raw): ResultAsync<LanguagePair, DomainError> => {
        if (raw === undefined) {
          return errAsync<LanguagePair, DomainError>(
            notFoundError({ resourceType: 'LanguagePair', identifier: 'default' }),
          );
        }
        return okAsync<unknown, DomainError>(raw).andThen((value) => createLanguagePair(value));
      }),

    saveDefaultLanguagePair: (pair) =>
      writeRaw(adapter, LANGUAGE_KEY, { source: pair.source, target: pair.target }),

    getDefaultOverlaySettings: () =>
      readRaw(adapter, OVERLAY_KEY).andThen((raw): ResultAsync<OverlaySettings, DomainError> => {
        if (raw === undefined) {
          return errAsync<OverlaySettings, DomainError>(
            notFoundError({ resourceType: 'OverlaySettings', identifier: 'default' }),
          );
        }
        return okAsync<unknown, DomainError>(raw).andThen((value) => createOverlaySettings(value));
      }),

    saveDefaultOverlaySettings: (settings) =>
      writeRaw(adapter, OVERLAY_KEY, {
        positionPreset: settings.positionPreset,
        opacity: settings.opacity,
        maxLines: settings.maxLines,
        fontScale: settings.fontScale,
        showOriginalText: settings.showOriginalText,
        showTranslatedText: settings.showTranslatedText,
      }),

    getDefaultEndpointingPolicy: () =>
      readRaw(adapter, STT_KEY).andThen((raw): ResultAsync<EndpointingPolicy, DomainError> => {
        if (raw === undefined) {
          return errAsync<EndpointingPolicy, DomainError>(
            notFoundError({ resourceType: 'EndpointingPolicy', identifier: 'default' }),
          );
        }
        return okAsync<unknown, DomainError>(raw).andThen((value) =>
          createEndpointingPolicy(value),
        );
      }),

    saveDefaultEndpointingPolicy: (policy) =>
      writeRaw(adapter, STT_KEY, {
        silenceThresholdMs: policy.silenceThresholdMs,
        punctuationAware: policy.punctuationAware,
        minUtteranceMs: policy.minUtteranceMs,
      }),

    getDefaultTranslationContextWindow: () =>
      readRaw(adapter, TRANSLATION_KEY).andThen(
        (raw): ResultAsync<TranslationContextWindow, DomainError> => {
          if (raw === undefined) {
            return errAsync<TranslationContextWindow, DomainError>(
              notFoundError({
                resourceType: 'TranslationContextWindow',
                identifier: 'default',
              }),
            );
          }
          return okAsync<unknown, DomainError>(raw).andThen((value) =>
            createTranslationContextWindow(value),
          );
        },
      ),

    saveDefaultTranslationContextWindow: (window) =>
      writeRaw(adapter, TRANSLATION_KEY, {
        maxSegments: window.maxSegments,
        includeTranslatedText: window.includeTranslatedText,
      }),

    getRelayConnectionOverride: () =>
      readRaw(adapter, RELAY_OVERRIDE_KEY).andThen(
        (raw): ResultAsync<RelayConnectionOverride | null, DomainError> => {
          if (raw === undefined || raw === null) {
            return okAsync<RelayConnectionOverride | null, DomainError>(null);
          }
          const parsed = relayOverrideSchema.safeParse(raw);
          if (!parsed.success) {
            return errAsync<RelayConnectionOverride | null, DomainError>(
              validationError({
                field: 'RelayConnectionOverride',
                message: parsed.error.issues.map((issue) => issue.message).join('; '),
              }),
            );
          }
          return okAsync<RelayConnectionOverride | null, DomainError>({
            baseUrl: parsed.data.baseUrl,
            accessToken: parsed.data.accessToken,
          });
        },
      ),

    saveRelayConnectionOverride: (override) => {
      const parsed = relayOverrideSchema.safeParse(override);
      if (!parsed.success) {
        return errAsync<void, DomainError>(
          validationError({
            field: 'RelayConnectionOverride',
            message: parsed.error.issues.map((issue) => issue.message).join('; '),
          }),
        );
      }
      return writeRaw(adapter, RELAY_OVERRIDE_KEY, {
        baseUrl: parsed.data.baseUrl,
        accessToken: parsed.data.accessToken,
      });
    },

    clearRelayConnectionOverride: () => removeRaw(adapter, RELAY_OVERRIDE_KEY),
  };
};

export { describeDomainError };
