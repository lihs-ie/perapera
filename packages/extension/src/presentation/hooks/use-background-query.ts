import { useCallback, useEffect, useRef, useState } from 'react';
import { type ApplicationError } from '../../application/errors/application-errors';
import { type BackgroundResponse } from '../infrastructure/background-client';

/**
 * Query 実行状態。Command との違い:
 * - 起動時 (mount) に自動で 1 回 fetch する
 * - 定期 polling を option で有効化できる
 * - `data` は前回 success 値を保持 (refetch 中も古いデータを表示可能)
 */
export type BackgroundQueryState<T> = Readonly<{
  status: 'idle' | 'pending' | 'success' | 'error';
  /** 最後に成功した値。mount 直後は `null` */
  data: T | null;
  /** 直近のエラー。`status === 'error'` のときに意味を持つ */
  error: ApplicationError | null;
}>;

export type BackgroundQueryHandle<Output> = Readonly<{
  state: BackgroundQueryState<Output>;
  refetch: () => Promise<void>;
}>;

export type BackgroundQueryOptions<Input> = Readonly<{
  /** 毎回の fetch 引数 (変更時は再 fetch) */
  input: Input;
  /** polling 間隔 (ms)。未指定なら mount 時 1 回のみ */
  intervalMs?: number;
  /** 一時停止フラグ (例: popup が backgrounded された時など) */
  paused?: boolean;
}>;

/**
 * IMPL-516 useBackgroundQuery — Popup / SidePanel で Background の Query 系
 * UseCase (SessionMonitorState 等) を polling 付きで取得する React hook。
 *
 * mount 時に 1 回 fetch し、`intervalMs` が指定されていれば以降定期的に refetch
 * する。`input` が JSON レベルで変化すると再 fetch が走る。
 *
 * polling タイマーは `paused=true` で一時停止できる。popup 非表示時の
 * visibilitychange 連携は caller 側で `paused` を制御する形。
 */
export const useBackgroundQuery = <Input, Output>(
  dispatch: (input: Input) => Promise<BackgroundResponse<Output>>,
  options: BackgroundQueryOptions<Input>,
): BackgroundQueryHandle<Output> => {
  const [state, setState] = useState<BackgroundQueryState<Output>>({
    status: 'idle',
    data: null,
    error: null,
  });
  const requestIdRef = useRef<number>(0);
  const inputKey = JSON.stringify(options.input);
  const inputRef = useRef(options.input);
  inputRef.current = options.input;
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  const fetchOnce = useCallback(async (): Promise<void> => {
    requestIdRef.current += 1;
    const currentRequest = requestIdRef.current;
    setState((prev) => ({ status: 'pending', data: prev.data, error: prev.error }));
    const response = await dispatchRef.current(inputRef.current);
    if (currentRequest !== requestIdRef.current) return;
    if (response.ok) {
      setState({ status: 'success', data: response.value, error: null });
    } else {
      setState((prev) => ({ status: 'error', data: prev.data, error: response.error }));
    }
  }, []);

  useEffect(() => {
    if (options.paused === true) return;
    void fetchOnce();
    if (options.intervalMs === undefined) return;
    const timer = globalThis.setInterval(() => {
      void fetchOnce();
    }, options.intervalMs);
    return () => {
      globalThis.clearInterval(timer);
    };
  }, [inputKey, options.intervalMs, options.paused, fetchOnce]);

  return { state, refetch: fetchOnce };
};
