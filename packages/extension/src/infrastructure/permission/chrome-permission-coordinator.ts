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
 * `contains` を必須にしたのは MV3 の manifest 宣言済み permission に対し
 * `request` を呼ぶと Chrome 版によっては user gesture 要求で reject する
 * ケースがあるため (Popup → background の async gap で user gesture が
 * 失効する)。`contains` は user gesture 非依存で常に動き、manifest 宣言済
 * permission は install 時に granted 済みのため即 true を返す。
 */
export type ChromePermissionsApi = Readonly<{
  contains: (permissions: chrome.permissions.Permissions) => Promise<boolean>;
  request: (permissions: chrome.permissions.Permissions) => Promise<boolean>;
}>;

const wrapCallbackPromise =
  (
    scope: (
      permissions: chrome.permissions.Permissions,
      callback: (granted: boolean) => void,
    ) => void,
  ) =>
  (permissions: chrome.permissions.Permissions): Promise<boolean> =>
    new Promise<boolean>((resolve, reject) => {
      try {
        scope(permissions, (granted) => {
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
    });

/**
 * Production `ChromePermissionsApi` 実装 (mock ではない)。
 * `chrome.permissions.contains` / `request` の callback API を Promise に wrap。
 */
export const defaultChromePermissionsApi: ChromePermissionsApi = {
  contains: wrapCallbackPromise((perms, cb) => chrome.permissions.contains(perms, cb)),
  request: wrapCallbackPromise((perms, cb) => chrome.permissions.request(perms, cb)),
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

const toSystemError =
  (scope: 'contains' | 'request') =>
  (cause: unknown): DomainError =>
    invariantViolationError({
      invariant: 'permission-coordinator-system-error',
      details: `${scope}: ${cause instanceof Error ? cause.message : String(cause)}`,
    });

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
    // manifest 宣言済み permission は install 時に granted 済みなので、
    // まず `contains` で確認し既に granted なら request を skip する
    // (`request` は user gesture 要求で reject するケースがあるため)。
    return ResultAsync.fromPromise<boolean, DomainError>(
      deps.chromePermissionsApi.contains(permissions),
      toSystemError('contains'),
    ).andThen<PermissionGrant, DomainError>((alreadyGranted) => {
      if (alreadyGranted) {
        return ResultAsync.fromPromise<PermissionGrant, DomainError>(
          Promise.resolve<PermissionGrant>({ status: 'granted', sourceType }),
          () =>
            invariantViolationError({
              invariant: 'permission-coordinator-impossible',
              details: 'already-granted resolved synchronously cannot error',
            }),
        );
      }
      return ResultAsync.fromPromise<boolean, DomainError>(
        deps.chromePermissionsApi.request(permissions),
        toSystemError('request'),
      ).map<PermissionGrant>((granted) =>
        granted
          ? { status: 'granted', sourceType }
          : {
              status: 'denied',
              sourceType,
              reason: `user denied ${sourceType} permission`,
            },
      );
    });
  },
});
