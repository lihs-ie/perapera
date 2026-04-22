import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { type BackgroundResponse } from '../infrastructure/background-client';
import { useBackgroundQuery } from './use-background-query';

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

describe('useBackgroundQuery (IMPL-516)', () => {
  it('fetches once on mount and transitions to success', async () => {
    const dispatch = vi.fn(() =>
      Promise.resolve<BackgroundResponse<number>>({ ok: true, value: 42 }),
    );
    const { result } = renderHook(() => useBackgroundQuery(dispatch, { input: { q: 'a' } }));
    await waitFor(() => expect(result.current.state.status).toBe('success'));
    expect(result.current.state.data).toBe(42);
  });

  it('retries fetch at intervalMs', async () => {
    const dispatch = vi.fn(() =>
      Promise.resolve<BackgroundResponse<number>>({ ok: true, value: 1 }),
    );
    renderHook(() => useBackgroundQuery(dispatch, { input: {}, intervalMs: 20 }));
    await waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1));
    await sleep(80);
    expect(dispatch.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('preserves previous data while refetching on error', async () => {
    const dispatch = vi
      .fn<() => Promise<BackgroundResponse<number>>>()
      .mockResolvedValueOnce({ ok: true, value: 100 })
      .mockResolvedValue({
        ok: false,
        error: { type: 'internal', code: 'INTERNAL_ERROR', message: 'fail' },
      });
    const { result } = renderHook(() =>
      useBackgroundQuery(dispatch, { input: {}, intervalMs: 20 }),
    );
    await waitFor(() => expect(result.current.state.data).toBe(100));
    await sleep(80);
    await waitFor(() => expect(result.current.state.status).toBe('error'));
    expect(result.current.state.data).toBe(100);
  });

  it('pauses polling when paused=true', async () => {
    const dispatch = vi.fn(() =>
      Promise.resolve<BackgroundResponse<number>>({ ok: true, value: 7 }),
    );
    const { rerender } = renderHook(
      (props: { paused: boolean }) =>
        useBackgroundQuery(dispatch, { input: {}, intervalMs: 20, paused: props.paused }),
      { initialProps: { paused: false } },
    );
    await waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1));
    rerender({ paused: true });
    await sleep(120);
    // paused 後の追加呼び出しは発生しない (但し rerender 前の 1 回は既にカウント済)
    expect(dispatch.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it('refetch dispatches manually regardless of interval', async () => {
    const dispatch = vi.fn(() =>
      Promise.resolve<BackgroundResponse<number>>({ ok: true, value: 1 }),
    );
    const { result } = renderHook(() => useBackgroundQuery(dispatch, { input: {} }));
    await waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1));
    await result.current.refetch();
    expect(dispatch).toHaveBeenCalledTimes(2);
  });
});
