import { ResultAsync } from 'neverthrow';
import { invariantViolationError, type DomainError } from '../../domain/shared/errors';
import { type OffscreenCommand } from '../../entrypoints/offscreen/offscreen-commands';
import { type RuntimeMessageBridge } from '../../application/services/offscreen-command-sender';

/**
 * IMPL-606 Chrome runtime message bridge (production adapter)。
 *
 * `chrome.runtime.sendMessage(undefined, message)` を呼び出し、Promise を
 * `ResultAsync<void, DomainError>` に変換する。`undefined` を extensionId に
 * 渡すと送信元と同じ拡張内の全 listener (offscreen / popup / sidepanel など)
 * へ broadcast される。Offscreen handler が discriminator (`type` field) で
 * 自分宛だけ拾う設計。
 *
 * 失敗 (chrome.runtime.lastError 含む) は `invariantViolationError` に変換。
 *
 * **本番実装で mock を使わない設計**:
 * - production では `defaultChromeRuntimeMessageBridge` をそのまま使う
 * - test では `RuntimeMessageBridge` 型に対する fake bridge を別途注入する
 */
export type ChromeRuntimeApi = Readonly<{
  sendMessage: (message: OffscreenCommand) => Promise<unknown>;
}>;

export const defaultChromeRuntimeApi: ChromeRuntimeApi = {
  sendMessage: (message) => chrome.runtime.sendMessage(message),
};

export const createChromeRuntimeMessageBridge = (
  api: ChromeRuntimeApi = defaultChromeRuntimeApi,
): RuntimeMessageBridge => {
  return {
    sendMessage: (command: OffscreenCommand) => {
      return ResultAsync.fromPromise(
        api.sendMessage(command),
        (cause): DomainError =>
          invariantViolationError({
            invariant: 'chrome-runtime-message-bridge',
            details: cause instanceof Error ? cause.message : String(cause),
          }),
      ).map(() => undefined);
    },
  };
};
