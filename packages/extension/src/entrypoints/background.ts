import {
  createExtensionApp,
  createProductionRuntimePorts,
  type ExtensionApp,
  type ExtensionRuntimeConfig,
} from '../composition/extension-composition';
import {
  createChromeLocalMainWindowBoundsStore,
  createMainWindowLifecycle,
  defaultWindowsApi,
} from '../composition/main-window-lifecycle';
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
  console.log('[perapera] ---- background service worker loaded ----');
  console.log('[perapera] runtime config:', {
    relayApiBaseUrl: RELAY_API_BASE_URL,
    hasAccessToken: RELAY_ACCESS_TOKEN.length > 0,
    accessTokenLength: RELAY_ACCESS_TOKEN.length,
    extensionVersion: EXTENSION_VERSION,
    workletModuleUrl: WORKLET_MODULE_URL,
  });

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

  // ensure Promise を cache して開始フローと SW 初期化の両方で共有する。
  // 単一 Promise を await することで idempotent かつ並行呼び出し安全。
  let offscreenEnsurePromise: Promise<void> | null = null;
  const ensureOffscreenReady = (): Promise<void> => {
    if (offscreenEnsurePromise === null) {
      console.log('[perapera] offscreen.ensure() start');
      offscreenEnsurePromise = offscreen.ensure().then(
        () => {
          console.log('[perapera] offscreen.ensure() done');
        },
        (cause: unknown) => {
          console.error('[perapera] offscreen.ensure() failed:', cause);
          // 次回再試行できるよう cache を破棄
          offscreenEnsurePromise = null;
          throw cause instanceof Error ? cause : new Error(String(cause));
        },
      );
    }
    return offscreenEnsurePromise;
  };

  // SW 起動時に fire-and-forget で ensure を開始 (main window 起動前に完了することを期待)
  void ensureOffscreenReady().catch(() => {
    // 失敗は console.error で記録済。session 開始時に再試行される
  });

  // chrome.action.onClicked → 独立 floating window (480×720, type=popup) を起動。
  // 既存 window があれば focus する idempotent 動作。manifest.action.default_popup
  // は未設定 (wxt.config.ts) なので、本 listener が発火する。
  const mainWindowUrl = chrome.runtime.getURL('/main.html');
  // Issue #111: main window の位置 / サイズを chrome.storage.local に永続化
  const mainWindowBoundsStore = createChromeLocalMainWindowBoundsStore();
  const mainWindowLifecycle = createMainWindowLifecycle({
    windowsApi: defaultWindowsApi,
    mainWindowUrl,
    boundsStore: mainWindowBoundsStore,
  });
  mainWindowLifecycle.registerBoundsListener();
  chrome.action.onClicked.addListener((tab) => {
    // action icon クリックは activeTab permission を「クリック時にアクティブだった
    // tab」に対してのみ grant する。main window は独立 window として開くため、
    // main window 内から `chrome.tabs.query({active:true,currentWindow:true})`
    // を呼ぶと main window 自身の tab が返り、元タブ (YouTube 等) を掴めない。
    // listener が受け取る `tab` は activeTab granted 元なので、
    // chrome.storage.session に保存して StartSessionForm 側で fallback 利用する。
    console.log('[perapera] action.onClicked: tab.id=', tab.id, 'url=', tab.url);
    if (typeof tab.id === 'number') {
      void chrome.storage.session
        ?.set({ lastActiveTabId: tab.id })
        .then(() => {
          console.log('[perapera] storage.session.lastActiveTabId =', tab.id);
        })
        .catch((cause: unknown) => {
          console.warn('[perapera] storage.session.set(lastActiveTabId) failed:', cause);
        });
    }
    void mainWindowLifecycle.openOrFocus().catch((cause: unknown) => {
      console.error('[perapera] main-window openOrFocus failed:', cause);
    });
  });

  const config: ExtensionRuntimeConfig = {
    relayApiBaseUrl: RELAY_API_BASE_URL,
    relayAccessToken: RELAY_ACCESS_TOKEN,
    extensionVersion: EXTENSION_VERSION,
    protocolVersion: '1.0',
    workletModuleUrl: WORKLET_MODULE_URL,
    ensureOffscreen: ensureOffscreenReady,
  };
  const ports = createProductionRuntimePorts();
  const app: ExtensionApp = createExtensionApp(config, ports);
  console.log('[perapera] ExtensionApp composed');

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
    getSessionHistoryQuery: app.getSessionHistoryQuery,
    getSessionHistoryDetailQuery: app.getSessionHistoryDetailQuery,
    settingsStore: app.settingsStore,
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
  const swMessageCountByType = new Map<string, number>();
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const messageType =
      typeof message === 'object' && message !== null && 'type' in message
        ? String(Reflect.get(message, 'type'))
        : 'unknown';
    if (messageType === 'audio.frame.forward') {
      const prev = swMessageCountByType.get(messageType) ?? 0;
      const next = prev + 1;
      swMessageCountByType.set(messageType, next);
      if (next === 1 || next % 50 === 0) {
        console.log(
          `[perapera] SW onMessage audio.frame.forward #${String(next)} (senderId=${String(sender.id)}, url=${sender.url ?? '-'})`,
        );
      }
    }
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
