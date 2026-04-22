import { createContentScriptOverlayPresenter } from '../../infrastructure/overlay/content-script-overlay-presenter';
import {
  createDefaultOverlayViewFactory,
  defaultOverlayDocumentApi,
} from '../../infrastructure/overlay/default-overlay-view';
import { parseOverlayCommand } from './overlay-commands';
import { createOverlayDispatcher } from './overlay-dispatcher';

/**
 * IMPL-558 Content script entry。
 *
 * Background Service Worker から chrome.runtime.sendMessage 経由で届く
 * `OverlayCommand` を受信 → Zod validation → `ContentScriptOverlayPresenter`
 * (IMPL-330) + `defaultOverlayViewFactory` (production default) で
 * Shadow DOM オーバーレイを描画する。
 *
 * **本番実装で mock / in-memory を使わない原則**:
 * - `defaultOverlayDocumentApi` を明示注入 (production default)
 * - presenter / dispatcher は real implementation (test 用 stub は使わない)
 * - chrome.runtime.onMessage listener で不明メッセージは silent ignore
 *   (Popup/SidePanel 向けの BackgroundResponse envelope は型が異なるため
 *   Zod validation で自然に落ちる)
 */
export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    console.log('[perapera] content script loaded');

    const viewFactory = createDefaultOverlayViewFactory({
      documentApi: defaultOverlayDocumentApi,
    });
    const presenter = createContentScriptOverlayPresenter({ overlayViewFactory: viewFactory });
    const dispatch = createOverlayDispatcher({ presenter });

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      const parsed = parseOverlayCommand(message);
      if (parsed.isErr()) {
        // OverlayCommand 以外の message (Popup/SidePanel ↔ Background の
        // BackgroundRequest 等) が流れてくるため silent ignore。return false で
        // listener が async 応答しないことを宣言する。
        return false;
      }
      void dispatch(parsed.value).finally(() => {
        sendResponse(undefined);
      });
      // async 応答を宣言する (sendResponse を呼び戻すまで port を開いたままにする)。
      return true;
    });
  },
});
