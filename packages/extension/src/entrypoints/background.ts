import {
  createExtensionApp,
  createProductionRuntimePorts,
  type ExtensionApp,
  type ExtensionRuntimeConfig,
} from '../composition/extension-composition';
import { createOffscreenLifecycle, defaultOffscreenApi } from '../composition/offscreen-lifecycle';
import { createRuntimeDispatcher, type RuntimeDispatcher } from '../composition/runtime-dispatcher';

/**
 * IMPL-500 Background Service Worker entrypoint。
 *
 * `createExtensionApp` で composition root を作り、`chrome.runtime.onMessage`
 * を dispatcher に結線する。Popup / SidePanel 側は `chrome.runtime.sendMessage`
 * で `BackgroundRequest` を送り、`BackgroundResponse<T>` を受け取る。
 *
 * **本番実装で mock / in-memory を使わない設計**:
 * - `createProductionRuntimePorts()` が返す default ports は全て real
 *   (chrome.\* / AudioContext / fetch / WebSocket / IndexedDB)
 * - env 由来 secret (`RELAY_ACCESS_TOKEN`) が欠落した場合は本 entry で
 *   console.error + 起動失敗 (UseCase 起動時に relay 接続が fail-fast)
 */

const RELAY_API_BASE_URL = (() => {
  const fromDefine =
    typeof import.meta.env.PERAPERA_RELAY_API_BASE_URL === 'string'
      ? import.meta.env.PERAPERA_RELAY_API_BASE_URL
      : undefined;
  return fromDefine ?? 'http://localhost:3001';
})();

const RELAY_ACCESS_TOKEN = (() => {
  const fromDefine =
    typeof import.meta.env.PERAPERA_RELAY_ACCESS_TOKEN === 'string'
      ? import.meta.env.PERAPERA_RELAY_ACCESS_TOKEN
      : undefined;
  return fromDefine ?? '';
})();

const EXTENSION_VERSION = (() => {
  try {
    const manifest = chrome.runtime.getManifest();
    return typeof manifest.version === 'string' ? manifest.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

const WORKLET_MODULE_URL = (() => {
  try {
    return chrome.runtime.getURL('/audio-worklet.js');
  } catch {
    return '/audio-worklet.js';
  }
})();

export default defineBackground(() => {
  console.log('[perapera] background service worker loaded');

  if (RELAY_ACCESS_TOKEN.length === 0) {
    console.error(
      '[perapera] PERAPERA_RELAY_ACCESS_TOKEN is not configured; relay calls will fail on session start. Configure via wxt define or chrome.storage.',
    );
  }

  // Offscreen document を SW 起動時に ensure。MV3 SW は AudioContext を直接
  // 扱えないため、offscreen document 側で確保する必要がある (IMPL-562)。
  // 既に存在する場合は no-op。失敗しても SW 自体は継続する (手動 smoke で確認)。
  const offscreen = createOffscreenLifecycle({
    offscreenApi: defaultOffscreenApi,
    documentUrl: chrome.runtime.getURL('/offscreen.html'),
  });
  void offscreen.ensure().catch((cause: unknown) => {
    console.error('[perapera] offscreen ensure failed:', cause);
  });

  const config: ExtensionRuntimeConfig = {
    relayApiBaseUrl: RELAY_API_BASE_URL,
    relayAccessToken: RELAY_ACCESS_TOKEN,
    extensionVersion: EXTENSION_VERSION,
    protocolVersion: '1.0',
    workletModuleUrl: WORKLET_MODULE_URL,
  };
  const ports = createProductionRuntimePorts();
  const app: ExtensionApp = createExtensionApp(config, ports);

  // SW 再起動時に IndexedDB に残存していた orphan active session を stopped 化
  // (IMPL-603, 設計論点 §10)。ensure() の完了を待たずに並列実行してよい
  // (異なるストレージ: chrome.offscreen vs IndexedDB)。
  void app.orphanSessionCleanup.cleanup().match(
    (summary) => {
      if (summary.recoveredCount > 0) {
        console.log(
          `[perapera] orphan-session-cleanup: ${summary.recoveredCount.toString()} sessions transitioned to stopped`,
        );
      }
    },
    (error) => {
      console.warn('[perapera] orphan-session-cleanup failed:', error);
    },
  );

  // 初回起動時は chrome.storage.local に default profile が存在せず、Popup の
  // 「開始」押下時に `ExtensionProfile not found: default` が返っていた。
  // SW 起動時に ensure して欠落していれば既定値を seed する (fire-and-forget)。
  void app.ensureDefaultProfile.ensure().match(
    (profile) => {
      console.log(
        `[perapera] default extension profile ready (identifier=${profile.profileIdentifier})`,
      );
    },
    (error) => {
      console.warn('[perapera] ensureDefaultProfile failed:', error);
    },
  );

  const dispatch: RuntimeDispatcher = createRuntimeDispatcher({
    sessionCommandService: app.sessionCommandService,
    exportService: app.exportService,
    getSessionMonitorStateQuery: app.getSessionMonitorStateQuery,
  });

  /**
   * chrome.runtime.onMessage listener。`sendResponse` は Promise 連携のため
   * `return true` で非同期応答を宣言し、dispatcher の Promise を解決したら
   * `sendResponse` に渡す (Chrome の仕様)。
   *
   * IMPL-618: offscreen document から転送された `audio.frame.forward` を
   * audioFrameForwardReceiver に先に渡す。receiver は該当しない message を
   * silent ignore するため、続けて dispatcher にも同じ message を流す。
   */
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    void app.audioFrameForwardReceiver.receive(message).match(
      () => undefined,
      (error) => {
        console.warn(
          '[perapera] audio-frame-forward-receiver failed:',
          'kind' in error ? error.kind : String(error),
        );
      },
    );
    void dispatch(message)
      .then((response) => {
        sendResponse(response);
      })
      .catch((cause: unknown) => {
        console.error('[perapera] runtime dispatcher threw:', cause);
        sendResponse({
          ok: false,
          error: {
            type: 'unexpected',
            message: cause instanceof Error ? cause.message : 'unknown error',
          },
        });
      });
    return true;
  });

  /**
   * Service Worker shutdown 時に IndexedDB connection を閉じる。
   * chrome.runtime.onSuspend は MV3 では非決定的だが、ベストエフォートで teardown。
   */
  chrome.runtime.onSuspend.addListener(() => {
    void app.close().catch((cause) => {
      console.warn('[perapera] ExtensionApp.close failed during onSuspend:', cause);
    });
    void offscreen.close().catch((cause) => {
      console.warn('[perapera] OffscreenLifecycle.close failed during onSuspend:', cause);
    });
  });
});
