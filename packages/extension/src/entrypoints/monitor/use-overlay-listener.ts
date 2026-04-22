import { useEffect } from 'react';
import { createContentScriptOverlayPresenter } from '../../infrastructure/overlay/content-script-overlay-presenter';
import {
  createDefaultOverlayViewFactory,
  defaultOverlayDocumentApi,
} from '../../infrastructure/overlay/default-overlay-view';
import { parseOverlayCommand } from '../content/overlay-commands';
import { createOverlayDispatcher } from '../content/overlay-dispatcher';

/**
 * IMPL-563 Monitor page overlay listener hook。
 *
 * Content script と同じ pattern で `chrome.runtime.onMessage` を listen し、
 * `OverlayCommand` を Shadow DOM overlay に dispatch する。Monitor page では
 * タブページではなく拡張が所有する HTML を対象にする (非 tab ソース: マイク /
 * デスクトップ音声向け)。
 *
 * 実装は本 hook を App root から 1 度だけ呼ぶ。contentScriptOverlayPresenter
 * はセッション単位で mount を管理するため、Monitor に複数セッションが流れ込んでも
 * overlay は同じ Shadow host を複数 session で共有しない (session ごとに別個の host)。
 *
 * 解除 (unmount): hook の useEffect cleanup で chrome.runtime.onMessage の
 * listener を remove する。開発中の HMR で leak しない。
 */
export const useOverlayListener = (): void => {
  useEffect(() => {
    const viewFactory = createDefaultOverlayViewFactory({
      documentApi: defaultOverlayDocumentApi,
    });
    const presenter = createContentScriptOverlayPresenter({ overlayViewFactory: viewFactory });
    const dispatch = createOverlayDispatcher({ presenter });

    const listener: Parameters<typeof chrome.runtime.onMessage.addListener>[0] = (
      message,
      _sender,
      sendResponse,
    ) => {
      const parsed = parseOverlayCommand(message);
      if (parsed.isErr()) return false;
      void dispatch(parsed.value).finally(() => {
        sendResponse(undefined);
      });
      return true;
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => {
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, []);
};
