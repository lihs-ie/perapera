import { ResultAsync } from 'neverthrow';
import { type SessionIdentifier } from '../../domain/session/session-identifier';
import { invariantViolationError, type DomainError } from '../../domain/shared/errors';
import { type OffscreenCommand } from '../../entrypoints/offscreen/offscreen-commands';

/**
 * IMPL-606 OffscreenCommandSender (application service)。
 *
 * SW (Background) から Offscreen document へ `OffscreenCommand` を送信する
 * application 層の thin wrapper。送信経路 (`chrome.runtime.sendMessage`) は
 * `RuntimeMessageBridge` port で抽象化され、test では fake bridge を注入できる。
 *
 * Offscreen 側 (IMPL-560 / IMPL-562) の `OffscreenAudioHost` が受信ハンドラを
 * 既に実装済 — 本 sender は SW 側の "送信側骨組み" のみを提供する。実 audio
 * 転送 (AudioWorklet で 100ms PCM16 frame 化 + offscreen → SW postMessage) は
 * 後続 PR (Phase 5+ 第 2 段) で扱う。
 *
 * **本番実装で mock を使わない設計**:
 * - `bridge` は必須 DI、production では `defaultRuntimeMessageBridge`
 *   (`chrome.runtime.sendMessage` を直接 wrap) を明示注入
 * - test では minimal fake bridge を注入する
 */
export type RuntimeMessageBridge = Readonly<{
  /** OffscreenCommand を chrome.runtime.sendMessage 経由で送信。失敗は DomainError */
  sendMessage: (command: OffscreenCommand) => ResultAsync<void, DomainError>;
}>;

export type OffscreenCommandSender = Readonly<{
  /**
   * Session に対する AudioContext を offscreen 側で確保。
   * `tabStreamId` (IMPL-610) を渡すと offscreen 側が
   * `getUserMedia({chromeMediaSource: 'tab', chromeMediaSourceId: tabStreamId})`
   * で MediaStream を確保する。tab 以外では省略 (microphone / desktop は
   * offscreen 側で別経路を使う)。
   */
  openAudioContext: (
    sessionIdentifier: SessionIdentifier,
    options?: Readonly<{ sampleRateHz?: number; tabStreamId?: string }>,
  ) => ResultAsync<void, DomainError>;
  /** Session に対する AudioContext を破棄 */
  closeAudioContext: (sessionIdentifier: SessionIdentifier) => ResultAsync<void, DomainError>;
  /** Offscreen document の死活確認 */
  ping: () => ResultAsync<void, DomainError>;
}>;

export type OffscreenCommandSenderDependencies = Readonly<{
  bridge: RuntimeMessageBridge;
  /**
   * Offscreen document の存在を保証する idempotent な Promise factory。
   * send 前に必ず await され、receiver 不在での `chrome.runtime.sendMessage`
   * 失敗 (`Receiving end does not exist`) を防ぐ。未指定なら skip (test seam)。
   * production では `offscreenLifecycle.ensure` を渡す。
   */
  ensureOffscreen?: () => Promise<void>;
  /**
   * 開発時のフロー追跡用。production の `console.log` が default。
   */
  logDebug?: (message: string) => void;
}>;

const defaultLogDebug = (message: string): void => {
  console.log(message);
};

export const createOffscreenCommandSender = (
  deps: OffscreenCommandSenderDependencies,
): OffscreenCommandSender => {
  const logDebug = deps.logDebug ?? defaultLogDebug;

  const sendAfterEnsure = (
    command: OffscreenCommand,
    label: string,
  ): ResultAsync<void, DomainError> => {
    const ensurePromise =
      deps.ensureOffscreen === undefined ? Promise.resolve() : deps.ensureOffscreen();
    return ResultAsync.fromPromise(
      ensurePromise,
      (cause): DomainError =>
        invariantViolationError({
          invariant: 'offscreen-ensure',
          details: `${label}: ${cause instanceof Error ? cause.message : String(cause)}`,
        }),
    ).andThen(() => {
      logDebug(
        `[perapera] offscreen-command-sender sending ${command.type} (${label}) after ensure()`,
      );
      return deps.bridge.sendMessage(command);
    });
  };

  return {
    openAudioContext: (sessionIdentifier, options) => {
      const base: {
        type: 'offscreen.audio.open';
        sessionIdentifier: SessionIdentifier;
        sampleRateHz?: number;
        tabStreamId?: string;
      } = { type: 'offscreen.audio.open', sessionIdentifier };
      if (options?.sampleRateHz !== undefined) base.sampleRateHz = options.sampleRateHz;
      if (options?.tabStreamId !== undefined) base.tabStreamId = options.tabStreamId;
      return sendAfterEnsure(base satisfies OffscreenCommand, 'openAudioContext');
    },
    closeAudioContext: (sessionIdentifier) =>
      sendAfterEnsure({ type: 'offscreen.audio.close', sessionIdentifier }, 'closeAudioContext'),
    ping: () => sendAfterEnsure({ type: 'offscreen.ping' }, 'ping'),
  };
};
