import { type OverlayPresenter } from '../../application/ports/overlay-presenter';
import { describeDomainError, type DomainError } from '../../domain/shared/errors';
import { type OverlayCommand } from './overlay-commands';

/**
 * IMPL-555 OverlayCommand → OverlayPresenter dispatcher (content script)。
 *
 * Content script 側で受信・検証済みの OverlayCommand を対応する
 * `OverlayPresenter` メソッドに振り分ける。Presenter の Result は
 * 個別にログへ落とし込み void Promise を返す (hot-path の描画失敗を
 * listener の呼び出し元に伝播させない設計)。
 */
export type OverlayDispatcher = (command: OverlayCommand) => Promise<void>;

export type OverlayDispatcherDependencies = Readonly<{
  presenter: OverlayPresenter;
  /** Err ログ用 sink。既定は console.warn。test で vi.fn を注入可能 */
  logWarn?: (message: string) => void;
}>;

const defaultLogWarn = (message: string): void => {
  console.warn(message);
};

const logPresenterError = (
  logWarn: (message: string) => void,
  scope: string,
  error: DomainError,
): void => {
  logWarn(`[perapera] overlay-dispatcher ${scope} failed: ${describeDomainError(error)}`);
};

export const createOverlayDispatcher = (deps: OverlayDispatcherDependencies): OverlayDispatcher => {
  const logWarn = deps.logWarn ?? defaultLogWarn;
  return async (command) => {
    switch (command.type) {
      case 'overlay.mount': {
        const result = await deps.presenter.mount(command.sessionIdentifier);
        if (result.isErr()) logPresenterError(logWarn, 'mount', result.error);
        return;
      }
      case 'overlay.render': {
        const result = await deps.presenter.render(command.model);
        if (result.isErr()) logPresenterError(logWarn, 'render', result.error);
        return;
      }
      case 'overlay.update-settings': {
        const result = await deps.presenter.updateSettings(
          command.sessionIdentifier,
          command.settings,
        );
        if (result.isErr()) logPresenterError(logWarn, 'update-settings', result.error);
        return;
      }
      case 'overlay.unmount': {
        const result = await deps.presenter.unmount(command.sessionIdentifier);
        if (result.isErr()) logPresenterError(logWarn, 'unmount', result.error);
        return;
      }
    }
  };
};
