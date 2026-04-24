import { ResultAsync } from 'neverthrow';
import { type OverlaySettings } from '../../domain/profile/overlay-settings';
import { type SessionIdentifier } from '../../domain/session/session-identifier';
import { type SessionState } from '../../domain/session/session-state';
import { invariantViolationError, type DomainError } from '../../domain/shared/errors';
import {
  type OverlayPresenter,
  type OverlayRenderModel,
} from '../../application/ports/overlay-presenter';
import { type SessionStateBroadcaster } from '../../application/ports/session-state-broadcaster';

/**
 * Overlay への chrome.* messaging 操作を隠蔽する adapter contract。
 * production では `chrome.runtime.sendMessage` / `chrome.tabs.sendMessage` を
 * wrap した default 実装、test では fake を注入する。
 *
 * **設計メモ**: Background Service Worker は DOM を直接扱えないため、
 * 実際の Shadow DOM / React rendering は Content Script 側に置く。
 * 本 adapter は SW 側 `OverlayPresenter` 契約を満たしつつ、描画命令を
 * 対象タブの content script または monitor page へ message で転送するだけ。
 */
export type OverlayMessagingBridge = Readonly<{
  /** content script / monitor へ overlay 描画命令を送る (fire-and-forget 可) */
  send: (message: OverlayCommand) => Promise<void>;
}>;

/**
 * Background → Content script / Monitor への overlay command envelope。
 * content script 側で Zod schema で validate する想定。
 */
export type OverlayCommand =
  | Readonly<{
      type: 'overlay.mount';
      sessionIdentifier: SessionIdentifier;
    }>
  | Readonly<{
      type: 'overlay.render';
      model: OverlayRenderModel;
    }>
  | Readonly<{
      type: 'overlay.update-settings';
      sessionIdentifier: SessionIdentifier;
      settings: OverlaySettings;
    }>
  | Readonly<{
      type: 'overlay.unmount';
      sessionIdentifier: SessionIdentifier;
    }>
  | Readonly<{
      type: 'session.state';
      sessionIdentifier: SessionIdentifier;
      state: SessionState;
      reason: string | null;
    }>;

/**
 * Production 用 `OverlayMessagingBridge` (mock ではない)。`chrome.runtime`
 * 越しに全 listener へブロードキャストする。content script は自身に紐づく
 * session のみを受け取り描画する (session ownership は content script 側で判定)。
 *
 * 送信失敗 (受信者ゼロを含む) は resolve される。`chrome.runtime.sendMessage`
 * の仕様上 listener 不在時に reject しないため、SW 側は常に成功として扱う。
 */
export const defaultOverlayMessagingBridge: OverlayMessagingBridge = {
  send: (message) =>
    new Promise<void>((resolve) => {
      try {
        // chrome.runtime.sendMessage は callback / Promise API の両方を持つ。
        // 互換性を取るため callback API を採用し、lastError を握り潰す
        // (受信者ゼロでも SW 側は正常終了とみなす)。
        chrome.runtime.sendMessage(message, () => {
          // Reset lastError implicitly by observing it once.
          void chrome.runtime.lastError;
          resolve();
        });
      } catch {
        resolve();
      }
    }),
};

export type ChromeMessagingOverlayPresenterDependencies = Readonly<{
  bridge: OverlayMessagingBridge;
}>;

const toInvariant =
  (scope: string) =>
  (cause: unknown): DomainError =>
    invariantViolationError({
      invariant: 'overlay-messaging',
      details: `${scope}: ${cause instanceof Error ? cause.message : String(cause)}`,
    });

/**
 * IMPL-331 ChromeMessagingOverlayPresenter (DD-108 派生)。
 *
 * Background Service Worker 側で `OverlayPresenter` 契約を満たす adapter。
 * 実際の描画は chrome.runtime messaging を介して content script / monitor
 * page に委譲する。content script 側 (Phase 5 PR 次 #4 で実装) が
 * `OverlayCommand` を受けて `ContentScriptOverlayPresenter` (IMPL-330) を
 * 呼ぶ構成。
 *
 * **本番実装で mock が利用されない設計**:
 * - `bridge` は必須 DI。production entrypoint で
 *   `defaultOverlayMessagingBridge` を明示的に渡す
 * - test では fake bridge を注入
 *
 * エラー型: chrome.runtime.sendMessage 側の throw を捕捉した場合のみ
 * `invariantViolationError({ invariant: 'overlay-messaging' })` を返す。
 * 受信者不在 (content script が読み込まれていない等) はエラーではなく
 * 正常終了 (UseCase 側で `match` により握り潰される、hot-path 停止回避)。
 */
export const createChromeMessagingOverlayPresenter = (
  deps: ChromeMessagingOverlayPresenterDependencies,
): OverlayPresenter => ({
  mount: (sessionIdentifier) =>
    ResultAsync.fromPromise<void, DomainError>(
      deps.bridge.send({ type: 'overlay.mount', sessionIdentifier }),
      toInvariant('mount'),
    ),

  render: (model) =>
    ResultAsync.fromPromise<void, DomainError>(
      deps.bridge.send({ type: 'overlay.render', model }),
      toInvariant('render'),
    ),

  updateSettings: (sessionIdentifier, settings) =>
    ResultAsync.fromPromise<void, DomainError>(
      deps.bridge.send({
        type: 'overlay.update-settings',
        sessionIdentifier,
        settings,
      }),
      toInvariant('updateSettings'),
    ),

  unmount: (sessionIdentifier) =>
    ResultAsync.fromPromise<void, DomainError>(
      deps.bridge.send({ type: 'overlay.unmount', sessionIdentifier }),
      toInvariant('unmount'),
    ),
});

/**
 * Issue #108: SessionStateBroadcaster の `OverlayMessagingBridge` 実装。
 * `session.state` command を `chrome.runtime.sendMessage` でブロードキャスト
 * する。bridge は overlay 用と同じ default (`defaultOverlayMessagingBridge`)
 * を共有し、main window 側の `useOverlayMessages` がまとめて購読する。
 */
export const createChromeMessagingSessionStateBroadcaster = (
  deps: ChromeMessagingOverlayPresenterDependencies,
): SessionStateBroadcaster => ({
  broadcast: (event) =>
    ResultAsync.fromPromise<void, DomainError>(
      deps.bridge.send({
        type: 'session.state',
        sessionIdentifier: event.sessionIdentifier,
        state: event.state,
        reason: event.reason,
      }),
      toInvariant('session.state.broadcast'),
    ),
});
