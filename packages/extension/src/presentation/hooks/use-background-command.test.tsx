import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { type BackgroundResponse } from '../infrastructure/background-client';
import { useBackgroundCommand } from './use-background-command';

describe('useBackgroundCommand (IMPL-515)', () => {
  it('starts in idle state', () => {
    const dispatch = vi.fn(() =>
      Promise.resolve<BackgroundResponse<number>>({ ok: true, value: 1 }),
    );
    const { result } = renderHook(() => useBackgroundCommand(dispatch));
    expect(result.current.state.status).toBe('idle');
  });

  it('transitions idle → pending → success', async () => {
    const dispatch = vi.fn(() =>
      Promise.resolve<BackgroundResponse<number>>({ ok: true, value: 42 }),
    );
    const { result } = renderHook(() => useBackgroundCommand(dispatch));
    await act(async () => {
      await result.current.execute(0);
    });
    expect(result.current.state.status).toBe('success');
    if (result.current.state.status === 'success') {
      expect(result.current.state.value).toBe(42);
    }
  });

  it('transitions to error on ApplicationError response', async () => {
    const dispatch = vi.fn(() =>
      Promise.resolve<BackgroundResponse<number>>({
        ok: false,
        error: { type: 'internal', code: 'INTERNAL_ERROR', message: 'boom' },
      }),
    );
    const { result } = renderHook(() => useBackgroundCommand(dispatch));
    await act(async () => {
      await result.current.execute(0);
    });
    expect(result.current.state.status).toBe('error');
    if (result.current.state.status === 'error') {
      expect(result.current.state.error.type).toBe('internal');
    }
  });

  it('reset returns state to idle', async () => {
    const dispatch = vi.fn(() =>
      Promise.resolve<BackgroundResponse<number>>({ ok: true, value: 1 }),
    );
    const { result } = renderHook(() => useBackgroundCommand(dispatch));
    await act(async () => {
      await result.current.execute(0);
    });
    expect(result.current.state.status).toBe('success');
    act(() => {
      result.current.reset();
    });
    expect(result.current.state.status).toBe('idle');
  });

  it('discards stale response when a newer execute is in flight', async () => {
    type Resolver = (value: BackgroundResponse<string>) => void;
    const deferred: { resolver: Resolver } = {
      resolver: () => undefined,
    };
    const firstCallPromise = new Promise<BackgroundResponse<string>>((resolve) => {
      deferred.resolver = resolve;
    });
    const dispatch = vi
      .fn<(input: number) => Promise<BackgroundResponse<string>>>()
      .mockImplementationOnce(() => firstCallPromise)
      .mockImplementationOnce(() =>
        Promise.resolve<BackgroundResponse<string>>({ ok: true, value: 'second' }),
      );
    const { result } = renderHook(() => useBackgroundCommand(dispatch));

    // 1st execute は resolve を保留 (stale 化したい)
    let firstExecutePromise: Promise<BackgroundResponse<string>> = Promise.resolve({
      ok: true,
      value: '',
    });
    act(() => {
      firstExecutePromise = result.current.execute(1);
    });
    await waitFor(() => expect(result.current.state.status).toBe('pending'));

    // 2nd execute を走らせて state を success に更新させる
    await act(async () => {
      await result.current.execute(2);
    });
    expect(result.current.state.status).toBe('success');
    if (result.current.state.status === 'success') {
      expect(result.current.state.value).toBe('second');
    }

    // 1st resolve を後出しで走らせても stale として破棄されるはず
    await act(async () => {
      deferred.resolver({ ok: true, value: 'first' });
      await firstExecutePromise;
    });
    expect(result.current.state.status).toBe('success');
    if (result.current.state.status === 'success') {
      expect(result.current.state.value).toBe('second');
    }
  });
});
