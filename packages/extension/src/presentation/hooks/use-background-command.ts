import { useCallback, useRef, useState } from 'react';
import { type ApplicationError } from '../../application/errors/application-errors';
import { type BackgroundResponse } from '../infrastructure/background-client';

/**
 * Command 実行状態。
 * - `idle`: 未実行
 * - `pending`: 送信中
 * - `success`: 最後の実行が成功し、`value` に output DTO
 * - `error`: 最後の実行が失敗し、`error` に ApplicationError
 */
export type BackgroundCommandState<T> =
  | Readonly<{ status: 'idle' }>
  | Readonly<{ status: 'pending' }>
  | Readonly<{ status: 'success'; value: T }>
  | Readonly<{ status: 'error'; error: ApplicationError }>;

export type BackgroundCommandHandle<Input, Output> = Readonly<{
  state: BackgroundCommandState<Output>;
  execute: (input: Input) => Promise<BackgroundResponse<Output>>;
  reset: () => void;
}>;

/**
 * IMPL-515 useBackgroundCommand — Popup / SidePanel で Background に向けた
 * 書き込み系 UseCase を呼ぶための React hook。実行状態 (idle / pending /
 * success / error) を state として管理する。
 *
 * 典型的な使い方:
 * ```ts
 * const { state, execute } = useBackgroundCommand(client.startSourceSession);
 * // <Button onClick={() => execute(input)} disabled={state.status === 'pending'} />
 * ```
 *
 * 二重実行保護は caller 側の disabled 制御に任せる (hook は素直に最新値を
 * 反映する)。競合回避のため内部で request id を持ち、古い結果を破棄する。
 */
export const useBackgroundCommand = <Input, Output>(
  dispatch: (input: Input) => Promise<BackgroundResponse<Output>>,
): BackgroundCommandHandle<Input, Output> => {
  const [state, setState] = useState<BackgroundCommandState<Output>>({ status: 'idle' });
  const requestIdRef = useRef<number>(0);

  const execute = useCallback(
    async (input: Input): Promise<BackgroundResponse<Output>> => {
      requestIdRef.current += 1;
      const currentRequest = requestIdRef.current;
      setState({ status: 'pending' });
      const response = await dispatch(input);
      if (currentRequest !== requestIdRef.current) {
        // 古い結果 — 破棄 (より新しい execute が走っている)
        return response;
      }
      if (response.ok) {
        setState({ status: 'success', value: response.value });
      } else {
        setState({ status: 'error', error: response.error });
      }
      return response;
    },
    [dispatch],
  );

  const reset = useCallback(() => {
    requestIdRef.current += 1;
    setState({ status: 'idle' });
  }, []);

  return { state, execute, reset };
};
