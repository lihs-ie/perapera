import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMainWindowLifecycle,
  type MainWindowBounds,
  type MainWindowBoundsStore,
  type MainWindowLifecycle,
  type WindowsApi,
} from './main-window-lifecycle';

const MAIN_URL = 'chrome-extension://abc/main.html';

const buildWindow = (overrides: Partial<chrome.windows.Window> = {}): chrome.windows.Window => ({
  id: 1,
  alwaysOnTop: false,
  focused: false,
  incognito: false,
  ...overrides,
});

const buildTab = (url: string, id = 1): chrome.tabs.Tab => ({
  id,
  url,
  index: 0,
  highlighted: false,
  active: false,
  pinned: false,
  incognito: false,
  selected: false,
  discarded: false,
  autoDiscardable: true,
  groupId: -1,
  windowId: 1,
});

const buildApi = (overrides: Partial<WindowsApi> = {}): WindowsApi => ({
  getAll: vi.fn(() => Promise.resolve<chrome.windows.Window[]>([])),
  create: vi.fn(() => Promise.resolve(undefined)),
  update: vi.fn(() => Promise.resolve(buildWindow({ focused: true }))),
  ...overrides,
});

const buildLifecycle = (api: WindowsApi): MainWindowLifecycle =>
  createMainWindowLifecycle({
    windowsApi: api,
    mainWindowUrl: MAIN_URL,
    logWarn: () => undefined,
  });

describe('createMainWindowLifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a new popup window with 480x720 when no existing window found', async () => {
    const api = buildApi();
    const lifecycle = buildLifecycle(api);
    await lifecycle.openOrFocus();
    expect(api.create).toHaveBeenCalledWith({
      url: MAIN_URL,
      type: 'popup',
      width: 480,
      height: 720,
    });
    expect(api.update).not.toHaveBeenCalled();
  });

  it('focuses the existing window and skips create when found', async () => {
    const api = buildApi({
      getAll: vi.fn(() =>
        Promise.resolve<chrome.windows.Window[]>([
          buildWindow({ id: 42, tabs: [buildTab(MAIN_URL, 7)] }),
        ]),
      ),
    });
    const lifecycle = buildLifecycle(api);
    await lifecycle.openOrFocus();
    expect(api.update).toHaveBeenCalledWith(42, { focused: true });
    expect(api.create).not.toHaveBeenCalled();
  });

  it('matches existing window by URL prefix (query string tolerant)', async () => {
    const api = buildApi({
      getAll: vi.fn(() =>
        Promise.resolve<chrome.windows.Window[]>([
          buildWindow({ id: 99, tabs: [buildTab(`${MAIN_URL}?debug=1`, 8)] }),
        ]),
      ),
    });
    const lifecycle = buildLifecycle(api);
    await lifecycle.openOrFocus();
    expect(api.update).toHaveBeenCalledWith(99, { focused: true });
  });

  it('ignores windows that do not host main.html', async () => {
    const api = buildApi({
      getAll: vi.fn(() =>
        Promise.resolve<chrome.windows.Window[]>([
          buildWindow({ id: 10, tabs: [buildTab('https://example.com', 1)] }),
        ]),
      ),
    });
    const lifecycle = buildLifecycle(api);
    await lifecycle.openOrFocus();
    expect(api.create).toHaveBeenCalledOnce();
  });

  it('falls back to create when existing window update fails', async () => {
    const api = buildApi({
      getAll: vi.fn(() =>
        Promise.resolve<chrome.windows.Window[]>([
          buildWindow({ id: 77, tabs: [buildTab(MAIN_URL, 9)] }),
        ]),
      ),
      update: vi.fn(() => Promise.reject(new Error('update failed'))),
    });
    const lifecycle = buildLifecycle(api);
    await lifecycle.openOrFocus();
    expect(api.create).toHaveBeenCalledOnce();
  });

  it('swallows getAll errors and still attempts create', async () => {
    const api = buildApi({
      getAll: vi.fn(() => Promise.reject(new Error('getAll failed'))),
    });
    const lifecycle = buildLifecycle(api);
    await lifecycle.openOrFocus();
    expect(api.create).toHaveBeenCalledOnce();
  });

  it('swallows create errors without throwing', async () => {
    const api = buildApi({
      create: vi.fn(() => Promise.reject(new Error('create failed'))),
    });
    const lifecycle = buildLifecycle(api);
    await expect(lifecycle.openOrFocus()).resolves.toBeUndefined();
  });

  it('accepts custom width/height overrides', async () => {
    const api = buildApi();
    const lifecycle = createMainWindowLifecycle({
      windowsApi: api,
      mainWindowUrl: MAIN_URL,
      width: 600,
      height: 800,
      logWarn: () => undefined,
    });
    await lifecycle.openOrFocus();
    expect(api.create).toHaveBeenCalledWith({
      url: MAIN_URL,
      type: 'popup',
      width: 600,
      height: 800,
    });
  });

  describe('bounds persistence (Issue #111)', () => {
    const buildStore = (overrides: Partial<MainWindowBoundsStore> = {}): MainWindowBoundsStore => ({
      loadBounds: vi.fn(() => Promise.resolve<MainWindowBounds | null>(null)),
      saveBounds: vi.fn(() => Promise.resolve()),
      ...overrides,
    });

    it('restores saved bounds in create options when available', async () => {
      const api = buildApi();
      const boundsStore = buildStore({
        loadBounds: vi.fn(() =>
          Promise.resolve<MainWindowBounds | null>({
            top: 100,
            left: 200,
            width: 500,
            height: 700,
          }),
        ),
      });
      const lifecycle = createMainWindowLifecycle({
        windowsApi: api,
        mainWindowUrl: MAIN_URL,
        boundsStore,
        logWarn: () => undefined,
      });
      await lifecycle.openOrFocus();
      expect(api.create).toHaveBeenCalledWith({
        url: MAIN_URL,
        type: 'popup',
        top: 100,
        left: 200,
        width: 500,
        height: 700,
      });
    });

    it('falls back to default size when loadBounds returns null', async () => {
      const api = buildApi();
      const boundsStore = buildStore();
      const lifecycle = createMainWindowLifecycle({
        windowsApi: api,
        mainWindowUrl: MAIN_URL,
        boundsStore,
        logWarn: () => undefined,
      });
      await lifecycle.openOrFocus();
      expect(api.create).toHaveBeenCalledWith({
        url: MAIN_URL,
        type: 'popup',
        width: 480,
        height: 720,
      });
    });

    it('persists bounds when onBoundsChanged fires for the tracked window', async () => {
      let registered: (window: chrome.windows.Window) => void = () => undefined;
      let captured = false;
      const api = buildApi({
        onBoundsChanged: {
          addListener: (listener) => {
            registered = listener;
            captured = true;
          },
        },
        create: vi.fn(() =>
          Promise.resolve(buildWindow({ id: 42, tabs: [buildTab(MAIN_URL, 7)] })),
        ),
      });
      const boundsStore = buildStore();
      const lifecycle = createMainWindowLifecycle({
        windowsApi: api,
        mainWindowUrl: MAIN_URL,
        boundsStore,
        logWarn: () => undefined,
      });
      lifecycle.registerBoundsListener();
      await lifecycle.openOrFocus();
      expect(registered).not.toBeNull();
      expect(captured).toBe(true);
      registered(buildWindow({ id: 42, top: 50, left: 60, width: 700, height: 900 }));
      expect(boundsStore.saveBounds).toHaveBeenCalledWith({
        top: 50,
        left: 60,
        width: 700,
        height: 900,
      });
    });

    it('ignores bounds events for other windows', async () => {
      let registered: (window: chrome.windows.Window) => void = () => undefined;
      let captured = false;
      const api = buildApi({
        onBoundsChanged: {
          addListener: (listener) => {
            registered = listener;
            captured = true;
          },
        },
        create: vi.fn(() => Promise.resolve(buildWindow({ id: 1, tabs: [buildTab(MAIN_URL, 7)] }))),
      });
      const boundsStore = buildStore();
      const lifecycle = createMainWindowLifecycle({
        windowsApi: api,
        mainWindowUrl: MAIN_URL,
        boundsStore,
        logWarn: () => undefined,
      });
      lifecycle.registerBoundsListener();
      await lifecycle.openOrFocus();
      expect(captured).toBe(true);
      registered(buildWindow({ id: 999, top: 0, left: 0, width: 300, height: 400 }));
      expect(boundsStore.saveBounds).not.toHaveBeenCalled();
    });

    it('ignores events with invalid bounds (missing / below min size)', async () => {
      let registered: (window: chrome.windows.Window) => void = () => undefined;
      let captured = false;
      const api = buildApi({
        onBoundsChanged: {
          addListener: (listener) => {
            registered = listener;
            captured = true;
          },
        },
        create: vi.fn(() => Promise.resolve(buildWindow({ id: 1, tabs: [buildTab(MAIN_URL, 7)] }))),
      });
      const boundsStore = buildStore();
      const lifecycle = createMainWindowLifecycle({
        windowsApi: api,
        mainWindowUrl: MAIN_URL,
        boundsStore,
        logWarn: () => undefined,
      });
      lifecycle.registerBoundsListener();
      await lifecycle.openOrFocus();
      expect(captured).toBe(true);
      registered(buildWindow({ id: 1, top: 0, left: 0, width: 50, height: 50 }));
      expect(boundsStore.saveBounds).not.toHaveBeenCalled();
    });

    it('registerBoundsListener without boundsStore is a noop', () => {
      const api = buildApi({
        onBoundsChanged: {
          addListener: vi.fn(),
        },
      });
      const lifecycle = createMainWindowLifecycle({
        windowsApi: api,
        mainWindowUrl: MAIN_URL,
        logWarn: () => undefined,
      });
      lifecycle.registerBoundsListener();
      expect(api.onBoundsChanged?.addListener).not.toHaveBeenCalled();
    });
  });
});
