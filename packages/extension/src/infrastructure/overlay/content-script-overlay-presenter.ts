import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import { type OverlaySettings } from '../../domain/profile/overlay-settings';
import { type SessionIdentifier } from '../../domain/session/session-identifier';
import { invariantViolationError, type DomainError } from '../../domain/shared/errors';
import {
  type OverlayPresenter,
  type OverlayRenderModel,
} from '../../application/ports/overlay-presenter';

/**
 * セッション毎に実体を持つ view controller。production では Shadow DOM host +
 * React root を抱える。test では `vi.fn` で mock する。
 *
 * `update` は render 時の最新 model と settings を同期的に受け取る。
 * 内部の描画が失敗した場合は `throw` してよい (presenter 側で
 * `invariantViolationError` に変換する)。
 */
export type OverlayView = Readonly<{
  mount: () => void;
  update: (model: OverlayRenderModel, settings: OverlaySettings | null) => void;
  unmount: () => void;
}>;

/**
 * セッション識別子に対し 1 つの `OverlayView` を生成する factory。
 * production の `defaultOverlayViewFactory` は Shadow DOM host を document.body
 * に注入し、React root を attach する。test では `vi.fn` mock を注入する。
 */
export type OverlayViewFactory = (sessionIdentifier: SessionIdentifier) => OverlayView;

export type ContentScriptOverlayPresenterDependencies = Readonly<{
  overlayViewFactory: OverlayViewFactory;
}>;

type SessionEntry = {
  view: OverlayView;
  settings: OverlaySettings | null;
};

/**
 * IMPL-330 ContentScriptOverlayPresenter (DD-108, DD-114)。
 *
 * `OverlayPresenter` ポート実装。セッション毎に `OverlayView` controller を
 * 生成し、mount / render / updateSettings / unmount を仲介する。
 *
 * **本番実装で mock が利用されない設計**:
 * - `overlayViewFactory` は必須 DI (default なし)
 * - production entrypoint で `defaultOverlayViewFactory` を明示的に渡す
 *
 * **設計メモ**:
 * - Shadow DOM / React rendering は view controller 側に閉じ込める。
 *   presenter 自体はセッション毎の view map と設定 cache のみを管理する
 * - `updateSettings` の反映は次の `render` 呼び出し時に行う (内部 cache 更新)
 * - `render` / `mount` 内での例外は `invariantViolationError` に変換する。
 *   UseCase 側で `orElse` で握り潰してホットパスを止めない設計 (DD-305 結果整合)
 */
export const createContentScriptOverlayPresenter = (
  deps: ContentScriptOverlayPresenterDependencies,
): OverlayPresenter => {
  const sessions = new Map<SessionIdentifier, SessionEntry>();

  return {
    mount: (sessionIdentifier) => {
      if (sessions.has(sessionIdentifier)) {
        return errAsync<void, DomainError>(
          invariantViolationError({
            invariant: 'overlay-already-mounted',
            details: `session ${sessionIdentifier} already has a mounted overlay view`,
          }),
        );
      }
      return ResultAsync.fromPromise<void, DomainError>(
        Promise.resolve().then(() => {
          const view = deps.overlayViewFactory(sessionIdentifier);
          view.mount();
          sessions.set(sessionIdentifier, { view, settings: null });
        }),
        (cause) =>
          invariantViolationError({
            invariant: 'overlay-mount-failed',
            details: cause instanceof Error ? cause.message : 'unknown error',
          }),
      );
    },

    render: (model) => {
      const entry = sessions.get(model.sessionIdentifier);
      if (entry === undefined) {
        return errAsync<void, DomainError>(
          invariantViolationError({
            invariant: 'overlay-not-mounted',
            details: `session ${model.sessionIdentifier} has no mounted overlay view`,
          }),
        );
      }
      return ResultAsync.fromPromise<void, DomainError>(
        Promise.resolve().then(() => {
          entry.view.update(model, entry.settings);
        }),
        (cause) =>
          invariantViolationError({
            invariant: 'overlay-render-failed',
            details: cause instanceof Error ? cause.message : 'unknown error',
          }),
      );
    },

    updateSettings: (sessionIdentifier, settings) => {
      const entry = sessions.get(sessionIdentifier);
      if (entry === undefined) {
        return errAsync<void, DomainError>(
          invariantViolationError({
            invariant: 'overlay-not-mounted',
            details: `session ${sessionIdentifier} has no mounted overlay view`,
          }),
        );
      }
      sessions.set(sessionIdentifier, { view: entry.view, settings });
      return okAsync(undefined);
    },

    unmount: (sessionIdentifier) => {
      const entry = sessions.get(sessionIdentifier);
      if (entry === undefined) return okAsync(undefined);
      return ResultAsync.fromPromise<void, DomainError>(
        Promise.resolve().then(() => {
          entry.view.unmount();
          sessions.delete(sessionIdentifier);
        }),
        (cause) =>
          invariantViolationError({
            invariant: 'overlay-unmount-failed',
            details: cause instanceof Error ? cause.message : 'unknown error',
          }),
      );
    },
  };
};
