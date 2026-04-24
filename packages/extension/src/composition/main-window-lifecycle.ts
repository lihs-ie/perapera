/**
 * Main window lifecycle helper。
 *
 * `chrome.action.onClicked` でアイコンが押されたときに、独立 floating window
 * (type: 'popup', 480×720) を開く / 既存なら focus する idempotent な責務を
 * 分離する。Issue #111 で bounds (top/left/width/height) の永続化を追加
 * しており、ユーザーが移動した位置を次回以降も保持する。
 *
 * **本番実装で mock を使わない設計**:
 * - `windowsApi` / `boundsStore` は必須 DI。production では `defaultWindowsApi`
 *   (`chrome.windows` を直接 wrap) と `createChromeLocalMainWindowBoundsStore`
 *   (`chrome.storage.local` を直接 wrap) を明示注入
 * - test では fake を注入する
 */

import { z } from 'zod';

export type WindowsApi = Readonly<{
  getAll: (options: { populate: boolean }) => Promise<chrome.windows.Window[]>;
  create: (options: chrome.windows.CreateData) => Promise<chrome.windows.Window | undefined>;
  update: (
    windowId: number,
    updateInfo: chrome.windows.UpdateInfo,
  ) => Promise<chrome.windows.Window>;
  /**
   * Issue #111: onBoundsChanged を subscribe するための addListener。
   * chrome.windows.onBoundsChanged.addListener と同 signature。optional にして
   * 既存 test の WindowsApi mock との互換を保つ。
   */
  onBoundsChanged?:
    | {
        addListener: (listener: (window: chrome.windows.Window) => void) => void;
        removeListener?: (listener: (window: chrome.windows.Window) => void) => void;
      }
    | undefined;
}>;

const buildDefaultOnBoundsChanged = (): WindowsApi['onBoundsChanged'] => {
  if (typeof chrome === 'undefined' || chrome.windows?.onBoundsChanged === undefined) {
    return undefined;
  }
  return {
    addListener: (listener) => {
      chrome.windows.onBoundsChanged.addListener(listener);
    },
    removeListener: (listener) => {
      chrome.windows.onBoundsChanged.removeListener(listener);
    },
  };
};

export const defaultWindowsApi: WindowsApi = {
  getAll: (options) => chrome.windows.getAll(options),
  create: (options) => chrome.windows.create(options),
  update: (windowId, updateInfo) => chrome.windows.update(windowId, updateInfo),
  onBoundsChanged: buildDefaultOnBoundsChanged(),
};

export type MainWindowBounds = Readonly<{
  top: number;
  left: number;
  width: number;
  height: number;
}>;

export type MainWindowBoundsStore = Readonly<{
  loadBounds: () => Promise<MainWindowBounds | null>;
  saveBounds: (bounds: MainWindowBounds) => Promise<void>;
}>;

const boundsSchema = z.object({
  top: z.number().int(),
  left: z.number().int(),
  width: z.number().int().positive().min(100),
  height: z.number().int().positive().min(100),
});

const BOUNDS_STORAGE_KEY = 'mainWindowBounds';

/**
 * Issue #111: chrome.storage.local 上の `mainWindowBounds` への読み書き adapter。
 * shape 違反は `null` 扱いで fallback、書き込み失敗は silent ignore (ログのみ)。
 */
export const createChromeLocalMainWindowBoundsStore = (
  logWarn: (message: string) => void = (message) => {
    console.warn(message);
  },
): MainWindowBoundsStore => ({
  loadBounds: async () => {
    try {
      const items: Record<string, unknown> = await chrome.storage.local.get(BOUNDS_STORAGE_KEY);
      const raw: unknown = items[BOUNDS_STORAGE_KEY];
      if (raw === undefined || raw === null) return null;
      const parsed = boundsSchema.safeParse(raw);
      if (!parsed.success) {
        logWarn(
          `[perapera] main-window bounds schema invalid: ${parsed.error.issues
            .map((issue) => issue.message)
            .join('; ')}`,
        );
        return null;
      }
      return parsed.data;
    } catch (cause) {
      logWarn(`[perapera] main-window boundsStore load failed: ${toMessage(cause)}`);
      return null;
    }
  },
  saveBounds: async (bounds) => {
    try {
      await chrome.storage.local.set({ [BOUNDS_STORAGE_KEY]: bounds });
    } catch (cause) {
      logWarn(`[perapera] main-window boundsStore save failed: ${toMessage(cause)}`);
    }
  },
});

export type MainWindowLifecycle = Readonly<{
  /** 既存の main window があれば focus、なければ新規に create する。create 時
   * に保存済 bounds があれば top/left/width/height を復元する。 */
  openOrFocus: () => Promise<void>;
  /** chrome.windows.onBoundsChanged を subscribe して main window の bounds を
   * 永続化する。background listener 配線から 1 度だけ呼ぶ。*/
  registerBoundsListener: () => void;
}>;

export type MainWindowLifecycleDependencies = Readonly<{
  windowsApi: WindowsApi;
  /** main.html の絶対 URL (`chrome.runtime.getURL('/main.html')`) */
  mainWindowUrl: string;
  /** window 幅 (default 480) */
  width?: number;
  /** window 高さ (default 720) */
  height?: number;
  logWarn?: (message: string) => void;
  /** Issue #111: 未指定時は bounds の save/restore を行わない (テスト互換) */
  boundsStore?: MainWindowBoundsStore;
}>;

const DEFAULT_WIDTH = 480;
const DEFAULT_HEIGHT = 720;

const defaultLogWarn = (message: string): void => {
  console.warn(message);
};

const toMessage = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

const hasValidBounds = (
  window: chrome.windows.Window,
): window is chrome.windows.Window & {
  top: number;
  left: number;
  width: number;
  height: number;
} =>
  typeof window.top === 'number' &&
  typeof window.left === 'number' &&
  typeof window.width === 'number' &&
  typeof window.height === 'number' &&
  window.width >= 100 &&
  window.height >= 100;

export const createMainWindowLifecycle = (
  deps: MainWindowLifecycleDependencies,
): MainWindowLifecycle => {
  const width = deps.width ?? DEFAULT_WIDTH;
  const height = deps.height ?? DEFAULT_HEIGHT;
  const logWarn = deps.logWarn ?? defaultLogWarn;
  let trackedWindowId: number | null = null;

  const findExisting = async (): Promise<chrome.windows.Window | null> => {
    try {
      const windows = await deps.windowsApi.getAll({ populate: true });
      for (const window of windows) {
        const tabs = window.tabs ?? [];
        for (const tab of tabs) {
          if (typeof tab.url === 'string' && tab.url.startsWith(deps.mainWindowUrl)) {
            return window;
          }
        }
      }
      return null;
    } catch (cause) {
      logWarn(`[perapera] main-window-lifecycle getAll failed: ${toMessage(cause)}`);
      return null;
    }
  };

  return {
    openOrFocus: async () => {
      const existing = await findExisting();
      if (existing?.id !== undefined) {
        trackedWindowId = existing.id;
        try {
          await deps.windowsApi.update(existing.id, { focused: true });
          return;
        } catch (cause) {
          logWarn(`[perapera] main-window-lifecycle update failed: ${toMessage(cause)}`);
        }
      }
      const saved = deps.boundsStore !== undefined ? await deps.boundsStore.loadBounds() : null;
      const createOptions: chrome.windows.CreateData =
        saved !== null
          ? {
              url: deps.mainWindowUrl,
              type: 'popup',
              top: saved.top,
              left: saved.left,
              width: saved.width,
              height: saved.height,
            }
          : {
              url: deps.mainWindowUrl,
              type: 'popup',
              width,
              height,
            };
      try {
        const created = await deps.windowsApi.create(createOptions);
        if (created?.id !== undefined) {
          trackedWindowId = created.id;
        }
      } catch (cause) {
        logWarn(`[perapera] main-window-lifecycle create failed: ${toMessage(cause)}`);
      }
    },
    registerBoundsListener: () => {
      if (deps.boundsStore === undefined || deps.windowsApi.onBoundsChanged === undefined) {
        return;
      }
      const boundsStore = deps.boundsStore;
      deps.windowsApi.onBoundsChanged.addListener((window) => {
        if (trackedWindowId === null || window.id !== trackedWindowId) return;
        if (!hasValidBounds(window)) return;
        void boundsStore.saveBounds({
          top: window.top,
          left: window.left,
          width: window.width,
          height: window.height,
        });
      });
    },
  };
};
