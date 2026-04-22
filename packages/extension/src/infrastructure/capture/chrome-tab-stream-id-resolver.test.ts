import { describe, expect, it, vi } from 'vitest';
import { createChromeTabStreamIdResolver } from './chrome-tab-stream-id-resolver';
import { type TabCaptureApi } from './tab-capture-source-adapter';

const buildApi = (): TabCaptureApi & {
  capture: ReturnType<typeof vi.fn<TabCaptureApi['capture']>>;
  getMediaStreamId: ReturnType<typeof vi.fn<TabCaptureApi['getMediaStreamId']>>;
} => ({
  capture: vi.fn<TabCaptureApi['capture']>(() => Promise.resolve(null)),
  getMediaStreamId: vi.fn<TabCaptureApi['getMediaStreamId']>(() =>
    Promise.resolve('tab-stream-id-fixture'),
  ),
});

describe('createChromeTabStreamIdResolver (IMPL-613)', () => {
  it('resolves streamId for a valid targetTabId', async () => {
    const api = buildApi();
    const resolver = createChromeTabStreamIdResolver(api);

    const result = await resolver.resolve(42);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe('tab-stream-id-fixture');
    }
    expect(api.getMediaStreamId).toHaveBeenCalledWith({ targetTabId: 42 });
  });

  it('maps getMediaStreamId rejection to invariant-violation', async () => {
    const api = buildApi();
    api.getMediaStreamId.mockRejectedValueOnce(new Error('tab not audible'));
    const resolver = createChromeTabStreamIdResolver(api);

    const result = await resolver.resolve(42);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.kind).toBe('invariant-violation');
      if (result.error.kind === 'invariant-violation') {
        expect(result.error.details).toContain('tab not audible');
      }
    }
  });
});
