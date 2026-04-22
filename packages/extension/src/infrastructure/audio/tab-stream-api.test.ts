import { describe, expect, it, vi } from 'vitest';
import { createTabStreamApi, type TabStreamFetcher } from './tab-stream-api';

const buildFetcher = (): TabStreamFetcher & {
  getUserMedia: ReturnType<typeof vi.fn<TabStreamFetcher['getUserMedia']>>;
} => {
  const getUserMedia = vi.fn<TabStreamFetcher['getUserMedia']>(() =>
    Promise.resolve(new MediaStream()),
  );
  return { getUserMedia };
};

describe('createTabStreamApi (IMPL-611)', () => {
  it('acquires a MediaStream for a valid streamId', async () => {
    const fetcher = buildFetcher();
    const api = createTabStreamApi(fetcher);

    const result = await api.acquire('tab-stream-id-fixture');

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBeInstanceOf(MediaStream);
    }
    expect(fetcher.getUserMedia).toHaveBeenCalledTimes(1);
  });

  it('passes Chrome legacy tab capture constraints (chromeMediaSource + id)', async () => {
    const fetcher = buildFetcher();
    const api = createTabStreamApi(fetcher);

    await api.acquire('tab-stream-id-fixture');

    const passed = fetcher.getUserMedia.mock.calls[0]?.[0];
    expect(passed).toBeDefined();
    // Chrome mandatory constraint は legacy 構文で TS 型にないため、object
    // 構造を直接検証する。toMatchObject で deep partial match。
    expect(passed).toMatchObject({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: 'tab-stream-id-fixture',
        },
      },
    });
  });

  it('returns invariant-violation when streamId is empty', async () => {
    const fetcher = buildFetcher();
    const api = createTabStreamApi(fetcher);

    const result = await api.acquire('');

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.kind).toBe('invariant-violation');
      if (result.error.kind === 'invariant-violation') {
        expect(result.error.details).toContain('non-empty');
      }
    }
    expect(fetcher.getUserMedia).not.toHaveBeenCalled();
  });

  it('maps getUserMedia rejection to invariant-violation', async () => {
    const getUserMedia = vi.fn<TabStreamFetcher['getUserMedia']>(() =>
      Promise.reject(new Error('permission denied')),
    );
    const api = createTabStreamApi({ getUserMedia });

    const result = await api.acquire('tab-stream-id-fixture');

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.kind).toBe('invariant-violation');
      if (result.error.kind === 'invariant-violation') {
        expect(result.error.details).toContain('permission denied');
      }
    }
  });
});
