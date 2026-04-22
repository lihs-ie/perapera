import { describe, expect, it, vi } from 'vitest';
import { createOffscreenLifecycle, type OffscreenApi } from './offscreen-lifecycle';

const URL = 'chrome-extension://xxx/offscreen.html';

const buildApi = (overrides: Partial<OffscreenApi> = {}): OffscreenApi => ({
  hasDocument: vi.fn(() => Promise.resolve(false)),
  createDocument: vi.fn(() => Promise.resolve()),
  closeDocument: vi.fn(() => Promise.resolve()),
  ...overrides,
});

describe('createOffscreenLifecycle (IMPL-601)', () => {
  it('creates the offscreen document on first ensure', async () => {
    const api = buildApi();
    const lifecycle = createOffscreenLifecycle({ offscreenApi: api, documentUrl: URL });
    await lifecycle.ensure();
    expect(api.createDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        url: URL,
        reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
      }),
    );
  });

  it('is idempotent across multiple ensure calls', async () => {
    const api = buildApi();
    const lifecycle = createOffscreenLifecycle({ offscreenApi: api, documentUrl: URL });
    await lifecycle.ensure();
    await lifecycle.ensure();
    await lifecycle.ensure();
    expect(api.createDocument).toHaveBeenCalledOnce();
  });

  it('skips createDocument when hasDocument returns true', async () => {
    const api = buildApi({
      hasDocument: vi.fn(() => Promise.resolve(true)),
    });
    const lifecycle = createOffscreenLifecycle({ offscreenApi: api, documentUrl: URL });
    await lifecycle.ensure();
    expect(api.createDocument).not.toHaveBeenCalled();
  });

  it('swallows already-exists errors from createDocument (race condition)', async () => {
    const api = buildApi({
      hasDocument: vi.fn(() => Promise.resolve(false)),
      createDocument: vi.fn(() =>
        Promise.reject(new Error('Only one offscreen document may exist')),
      ),
    });
    const lifecycle = createOffscreenLifecycle({ offscreenApi: api, documentUrl: URL });
    await expect(lifecycle.ensure()).resolves.toBeUndefined();
    // 2 度目の ensure は createDocument を呼ばない (すでに created=true)
    await lifecycle.ensure();
    expect(api.createDocument).toHaveBeenCalledOnce();
  });

  it('re-throws non-already-exists createDocument errors', async () => {
    const logWarn = vi.fn();
    const api = buildApi({
      hasDocument: vi.fn(() => Promise.resolve(false)),
      createDocument: vi.fn(() => Promise.reject(new Error('permission denied'))),
    });
    const lifecycle = createOffscreenLifecycle({
      offscreenApi: api,
      documentUrl: URL,
      logWarn,
    });
    await expect(lifecycle.ensure()).rejects.toThrow(/permission denied/);
    expect(logWarn).toHaveBeenCalled();
  });

  it('continues ensure when hasDocument throws (falls through to createDocument)', async () => {
    const logWarn = vi.fn();
    const api = buildApi({
      hasDocument: vi.fn(() => Promise.reject(new Error('api unavailable'))),
    });
    const lifecycle = createOffscreenLifecycle({
      offscreenApi: api,
      documentUrl: URL,
      logWarn,
    });
    await lifecycle.ensure();
    expect(api.createDocument).toHaveBeenCalledOnce();
    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('api unavailable'));
  });

  it('close calls closeDocument and resets state', async () => {
    const api = buildApi();
    const lifecycle = createOffscreenLifecycle({ offscreenApi: api, documentUrl: URL });
    await lifecycle.ensure();
    await lifecycle.close();
    expect(api.closeDocument).toHaveBeenCalledOnce();
    // 再度 ensure で createDocument が呼ばれる (state リセット)
    await lifecycle.ensure();
    expect(api.createDocument).toHaveBeenCalledTimes(2);
  });

  it('close without prior ensure is a no-op', async () => {
    const api = buildApi();
    const lifecycle = createOffscreenLifecycle({ offscreenApi: api, documentUrl: URL });
    await lifecycle.close();
    expect(api.closeDocument).not.toHaveBeenCalled();
  });

  it('respects custom reasons / justification', async () => {
    const api = buildApi();
    const lifecycle = createOffscreenLifecycle({
      offscreenApi: api,
      documentUrl: URL,
      reasons: [chrome.offscreen.Reason.DOM_PARSER],
      justification: 'custom reason',
    });
    await lifecycle.ensure();
    expect(api.createDocument).toHaveBeenCalledWith({
      url: URL,
      reasons: [chrome.offscreen.Reason.DOM_PARSER],
      justification: 'custom reason',
    });
  });
});
