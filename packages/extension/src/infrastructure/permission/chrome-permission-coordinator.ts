import { ResultAsync } from 'neverthrow';
import {
  type PermissionCoordinator,
  type PermissionGrant,
} from '../../application/ports/permission-coordinator';
import { type SourceType } from '../../domain/session/source-type';
import { invariantViolationError, type DomainError } from '../../domain/shared/errors';

/**
 * chrome.permissions API の最小 contract。production では chrome.permissions を
 * そのまま利用する default 実装を、test では minimal fake を注入する。
 *
 * MVP では `request` のみを使う ( `contains` / `remove` は将来拡張)。
 */
export type ChromePermissionsApi = Readonly<{
  request: (permissions: chrome.permissions.Permissions) => Promise<boolean>;
}>;

/**
 * Production `ChromePermissionsApi` 実装 (mock ではない)。
 * `chrome.permissions.request` の callback API を Promise に wrap する。
 * `chrome.runtime.lastError` は Promise reject に変換する。
 */
export const defaultChromePermissionsApi: ChromePermissionsApi = {
  request: (permissions) =>
    new Promise<boolean>((resolve, reject) => {
      try {
        chrome.permissions.request(permissions, (granted) => {
          const lastError = chrome.runtime.lastError;
          if (lastError !== undefined) {
            reject(new Error(lastError.message ?? 'unknown chrome.permissions error'));
            return;
          }
          resolve(granted);
        });
      } catch (cause) {
        reject(cause instanceof Error ? cause : new Error(String(cause)));
      }
    }),
};

/**
 * `SourceType` に応じた chrome.permissions request パラメータ (DD-001)。
 *
 * MV3 拡張では `permissions` / `host_permissions` / `audio-capture` host が
 * manifest 側で静的宣言される一方、`desktopCapture` / `tabCapture` の runtime
 * 許可はユーザーのアクション伴う確認が必要。ここでは MVP 範囲として
 * optional permissions の request を通す。
 */
const PERMISSION_FOR_SOURCE: Readonly<Record<SourceType, chrome.permissions.Permissions>> = {
  tab: { permissions: ['tabCapture'] },
  microphone: { permissions: [], origins: [] }, // microphone は getUserMedia の UA prompt に依存
  desktop: { permissions: ['desktopCapture'] },
};

/**
 * IMPL-318 ChromePermissionCoordinator (DD-001)。
 *
 * `chrome.permissions.request` を介して拡張が必要とする optional permission を
 * 要求する `PermissionCoordinator` 実装。microphone については chrome API 側で
 * 扱わず、`getUserMedia` の UA prompt に委ねる (granted を即時返す)。
 *
 * **本番実装で mock が利用されない設計**:
 * - `chromePermissionsApi` は必須 DI。production entrypoint で
 *   `defaultChromePermissionsApi` を明示的に渡す
 * - test では minimal fake を注入する
 *
 * `PermissionGrant.denied` はドメイン仕様上 DomainError ではない。
 * chrome.permissions.request が throw / reject した場合のみ DomainError を返す。
 */
export type ChromePermissionCoordinatorDependencies = Readonly<{
  chromePermissionsApi: ChromePermissionsApi;
}>;

export const createChromePermissionCoordinator = (
  deps: ChromePermissionCoordinatorDependencies,
): PermissionCoordinator => ({
  requestFor: (sourceType) => {
    const permissions = PERMISSION_FOR_SOURCE[sourceType];
    const permissionsIsEmpty =
      (permissions.permissions?.length ?? 0) === 0 && (permissions.origins?.length ?? 0) === 0;
    if (permissionsIsEmpty) {
      return ResultAsync.fromPromise<PermissionGrant, DomainError>(
        Promise.resolve<PermissionGrant>({ status: 'granted', sourceType }),
        () =>
          invariantViolationError({
            invariant: 'permission-coordinator-impossible',
            details: 'empty permissions resolved synchronously cannot error',
          }),
      );
    }
    return ResultAsync.fromPromise<boolean, DomainError>(
      deps.chromePermissionsApi.request(permissions),
      (cause) =>
        invariantViolationError({
          invariant: 'permission-coordinator-system-error',
          details: cause instanceof Error ? cause.message : String(cause),
        }),
    ).map<PermissionGrant>((granted) =>
      granted
        ? { status: 'granted', sourceType }
        : {
            status: 'denied',
            sourceType,
            reason: `user denied ${sourceType} permission`,
          },
    );
  },
});
