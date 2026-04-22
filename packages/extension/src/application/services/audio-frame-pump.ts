import { type ResultAsync } from 'neverthrow';
import { type SessionIdentifier } from '../../domain/session/session-identifier';
import { describeDomainError, type DomainError } from '../../domain/shared/errors';
import { type AudioFrameChannel, type AudioFrameEnvelope } from '../ports/audio-preprocessor';

/**
 * IMPL-602 AudioFramePump (application service)。
 *
 * `CaptureOrchestrator.connect` が返す `AudioFrameChannel.frames`
 * (AsyncIterable<AudioFrameEnvelope>) を iterate し、各フレームを注入された
 * `sendFrame` (通常 `RelayGateway.sendAudioFrame`) へ逐次引き渡す pump。
 *
 * ホットパス最重要 (CLAUDE.md §ホットパス / infrastructure.md §10.1):
 * - 永続キューを挟まない (backpressure は `await sendFrame(frame)` の自然 slowdown のみ)
 * - 送信失敗は 1 回 warn + continue (retry / queue は MVP では持たない)
 * - `frameChannel.close()` は呼ばない — channel ライフサイクルは
 *   `CaptureOrchestrator.disconnect` に委譲し、2 重 close を回避
 *
 * **本番実装で mock を使わない設計**:
 * - `sendFrame` は `RelayGateway.sendAudioFrame` の関数参照として注入
 * - pump 自身は RelayGateway を知らず、依存方向を単純化
 */
export type SendAudioFrame = (frame: AudioFrameEnvelope) => ResultAsync<void, DomainError>;

export type AudioFramePump = Readonly<{
  /**
   * Session に対して drain loop を開始する。
   * 同一 session で既に active な pump があれば先に abort してから新規開始 (冪等)。
   */
  start: (
    sessionIdentifier: SessionIdentifier,
    frameChannel: AudioFrameChannel,
    sendFrame: SendAudioFrame,
  ) => void;
  /** Session に対応する drain loop を abort する。未登録 session は no-op */
  stop: (sessionIdentifier: SessionIdentifier) => void;
  /** SW shutdown / ExtensionApp.close 時に全 drain を abort */
  stopAll: () => void;
  /** Active な drain 数 (test / metrics 用) */
  activeCount: () => number;
}>;

export type AudioFramePumpDependencies = Readonly<{
  /** Err ログ sink。default console.warn */
  logWarn?: (message: string) => void;
}>;

const defaultLogWarn = (message: string): void => {
  console.warn(message);
};

export const createAudioFramePump = (deps: AudioFramePumpDependencies = {}): AudioFramePump => {
  const logWarn = deps.logWarn ?? defaultLogWarn;
  const active = new Map<SessionIdentifier, AbortController>();

  const drain = async (
    sessionIdentifier: SessionIdentifier,
    frameChannel: AudioFrameChannel,
    sendFrame: SendAudioFrame,
    signal: AbortSignal,
  ): Promise<void> => {
    try {
      for await (const frame of frameChannel.frames) {
        if (signal.aborted) return;
        const result = await sendFrame(frame);
        if (result.isErr()) {
          logWarn(
            `[perapera] audio-frame-pump sendFrame failed for ${sessionIdentifier}: ${describeDomainError(
              result.error,
            )}`,
          );
        }
      }
    } catch (cause) {
      if (signal.aborted) return;
      logWarn(
        `[perapera] audio-frame-pump iterate threw for ${sessionIdentifier}: ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
      );
    }
  };

  return {
    start: (sessionIdentifier, frameChannel, sendFrame) => {
      const existing = active.get(sessionIdentifier);
      if (existing !== undefined) existing.abort();
      const controller = new AbortController();
      active.set(sessionIdentifier, controller);
      void drain(sessionIdentifier, frameChannel, sendFrame, controller.signal).finally(() => {
        if (active.get(sessionIdentifier) === controller) {
          active.delete(sessionIdentifier);
        }
      });
    },
    stop: (sessionIdentifier) => {
      const controller = active.get(sessionIdentifier);
      if (controller === undefined) return;
      controller.abort();
      active.delete(sessionIdentifier);
    },
    stopAll: () => {
      for (const controller of active.values()) {
        controller.abort();
      }
      active.clear();
    },
    activeCount: () => active.size,
  };
};
