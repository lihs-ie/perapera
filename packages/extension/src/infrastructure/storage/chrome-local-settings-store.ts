import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import { createOverlaySettings, type OverlaySettings } from '../../domain/profile/overlay-settings';
import { createLanguagePair, type LanguagePair } from '../../domain/session/language-pair';
import {
  describeDomainError,
  invariantViolationError,
  notFoundError,
  type DomainError,
} from '../../domain/shared/errors';
import { type SettingsStore } from '../../application/ports/settings-store';

const LANGUAGE_KEY = 'settings.language.defaultLanguagePair';
const OVERLAY_KEY = 'settings.overlay.defaultOverlaySettings';

/**
 * chrome.storage.local の overload を隠蔽した最小 adapter。
 * テストでは直接 mock 実装を注入できる。production では `chrome.storage.local`
 * を呼ぶ default 実装を使う。
 */
export type ChromeStorageAdapter = Readonly<{
  get: (keys: readonly string[]) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
}>;

export const defaultChromeStorageAdapter: ChromeStorageAdapter = {
  get: async (keys) => {
    const items: Record<string, unknown> = await chrome.storage.local.get([...keys]);
    return items;
  },
  set: async (items) => {
    await chrome.storage.local.set(items);
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
export const createChromeLocalSettingsStore = (
  adapter: ChromeStorageAdapter = defaultChromeStorageAdapter,
): SettingsStore => {
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
  };
};

export { describeDomainError };
