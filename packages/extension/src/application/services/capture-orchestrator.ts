import { okAsync, type ResultAsync } from 'neverthrow';
import { type SessionIdentifier } from '../../domain/session/session-identifier';
import { type SourceType } from '../../domain/session/source-type';
import { type DomainError } from '../../domain/shared/errors';
import { type AudioFrameChannel } from '../ports/audio-preprocessor';
import { type StartSourceCommand } from '../ports/source-adapter';

/**
 * Active な音声キャプチャ 1 本の実体。
 *
 * MV3 Service Worker では `MediaStream` / `AudioContext` が利用できない
 * ため、実 stream と AudioWorklet は **offscreen document 側**で保持する
 * (IMPL-612〜618)。SW 側の `ActiveCapture` は session identity / source
 * type / empty frame channel の placeholder に留める。実フレームは
 * offscreen → SW へ `audio.frame.forward` メッセージで転送され、
 * `AudioFrameForwardReceiver` 経由で Relay へ届く。
 */
export type ActiveCapture = Readonly<{
  sessionIdentifier: SessionIdentifier;
  sourceType: SourceType;
  frameChannel: AudioFrameChannel;
}>;

/**
 * IMPL-341 CaptureOrchestrator (detailed-design §2.2)。
 *
 * SW 側での session ごとの placeholder 管理を担う。
 *
 * **本番実装で mock が利用されない設計**:
 * - 依存は不要 (state 保持のみ)。production entrypoint でそのまま `createCaptureOrchestrator()` を呼ぶ
 *
 * **MV3 制約との整合**: `chrome.tabCapture.capture` / `AudioContext` は
 * SW で動作しないため、`connect` では実 MediaStream を取得せず empty
 * frame channel を返す。SW → offscreen の `audio.open` コマンドで
 * offscreen 側が `chrome.tabCapture.getMediaStreamId` + `getUserMedia`
 * 経由で stream を取得し、AudioWorklet → `audio.frame.forward` 経由で
 * PCM16 フレームを Relay へ流す。
 */
export type CaptureOrchestrator = Readonly<{
  connect: (command: StartSourceCommand) => ResultAsync<ActiveCapture, DomainError>;
  disconnect: (sessionIdentifier: SessionIdentifier) => ResultAsync<void, DomainError>;
}>;

const createEmptyFrameChannel = (): AudioFrameChannel => {
  let closed = false;
  return {
    frames: {
      [Symbol.asyncIterator]: () => ({
        next: () =>
          Promise.resolve<IteratorResult<never>>({
            done: true,
            value: undefined,
          }),
      }),
    },
    close: () => {
      closed = true;
      void closed;
    },
  };
};

export const createCaptureOrchestrator = (): CaptureOrchestrator => {
  const active = new Map<SessionIdentifier, ActiveCapture>();

  return {
    connect: (command) => {
      const capture: ActiveCapture = {
        sessionIdentifier: command.sessionIdentifier,
        sourceType: command.sourceType,
        frameChannel: createEmptyFrameChannel(),
      };
      active.set(command.sessionIdentifier, capture);
      return okAsync<ActiveCapture, DomainError>(capture);
    },
    disconnect: (sessionIdentifier) => {
      const capture = active.get(sessionIdentifier);
      if (capture === undefined) return okAsync<void, DomainError>(undefined);
      active.delete(sessionIdentifier);
      capture.frameChannel.close();
      return okAsync<void, DomainError>(undefined);
    },
  };
};
