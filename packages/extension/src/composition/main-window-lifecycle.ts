/**
 * Main window lifecycle helper。
 *
 * `chrome.action.onClicked` でアイコンが押されたときに、独立 floating window
 * (type: 'popup', 480×720) を開く / 既存なら focus する idempotent な責務を
 * 分離する。
 *
 * **本番実装で mock を使わない設計**:
 * - `windowsApi` は必須 DI。production では `defaultWindowsApi`
 *   (`chrome.windows` を直接 wrap) を明示注入
 * - test では fake を注入する
 */

export type WindowsApi = Readonly<{
  getAll: (options: { populate: boolean }) => Promise<chrome.windows.Window[]>;
  create: (options: chrome.windows.CreateData) => Promise<chrome.windows.Window | undefined>;
  update: (
    windowId: number,
    updateInfo: chrome.windows.UpdateInfo,
  ) => Promise<chrome.windows.Window>;
}>;

export const defaultWindowsApi: WindowsApi = {
  getAll: (options) => chrome.windows.getAll(options),
  create: (options) => chrome.windows.create(options),
  update: (windowId, updateInfo) => chrome.windows.update(windowId, updateInfo),
};

export type MainWindowLifecycle = Readonly<{
  /** 既存の main window があれば focus、なければ新規に create する */
  openOrFocus: () => Promise<void>;
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
}>;

const DEFAULT_WIDTH = 480;
const DEFAULT_HEIGHT = 720;

const defaultLogWarn = (message: string): void => {
  console.warn(message);
};

const toMessage = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

export const createMainWindowLifecycle = (
  deps: MainWindowLifecycleDependencies,
): MainWindowLifecycle => {
  const width = deps.width ?? DEFAULT_WIDTH;
  const height = deps.height ?? DEFAULT_HEIGHT;
  const logWarn = deps.logWarn ?? defaultLogWarn;

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
        try {
          await deps.windowsApi.update(existing.id, { focused: true });
          return;
        } catch (cause) {
          logWarn(`[perapera] main-window-lifecycle update failed: ${toMessage(cause)}`);
        }
      }
      try {
        await deps.windowsApi.create({
          url: deps.mainWindowUrl,
          type: 'popup',
          width,
          height,
        });
      } catch (cause) {
        logWarn(`[perapera] main-window-lifecycle create failed: ${toMessage(cause)}`);
      }
    },
  };
};
