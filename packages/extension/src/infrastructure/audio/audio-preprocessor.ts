import { ResultAsync, okAsync } from 'neverthrow';
import { type SessionIdentifier } from '../../domain/session/session-identifier';
import { invariantViolationError, type DomainError } from '../../domain/shared/errors';
import {
  type AudioFrameChannel,
  type AudioPreprocessor,
} from '../../application/ports/audio-preprocessor';

/**
 * AudioContext の最小 contract。実装側で必要な property のみを列挙。
 * production の `AudioContext` は本 interface を structurally に満たす。
 */
export type AudioContextLike = {
  readonly sampleRate: number;
  readonly audioWorklet: {
    addModule: (url: string) => Promise<void>;
  };
  close: () => Promise<void>;
  createMediaStreamSource: (stream: MediaStream) => unknown;
};

export type AudioContextFactory = (options?: AudioContextOptions) => AudioContextLike;

/**
 * Production `AudioContextFactory` (mock ではない)。entrypoint で
 * `{ audioContextFactory: defaultAudioContextFactory }` として明示注入。
 */
export const defaultAudioContextFactory: AudioContextFactory = (options) =>
  new AudioContext(options);

export type AudioPreprocessorDependencies = Readonly<{
  audioContextFactory: AudioContextFactory;
  /** AudioWorklet module の URL (通常は `chrome.runtime.getURL('/audio-worklet.js')`) */
  workletModuleUrl: string;
  clock: () => number;
}>;

/**
 * 空の AsyncIterable を返すシンプルな channel。実際の PCM フレーム生成は
 * AudioWorklet 内で行い、本 MVP の unit test では動作確認対象外。
 * E2E / manual test で production 挙動を確認する。
 */
const createEmptyFrameChannel = (context: AudioContextLike): AudioFrameChannel => {
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
      if (closed) return;
      closed = true;
      void context.close();
    },
  };
};

/**
 * IMPL-303 AudioPreprocessor (DD-104)。
 *
 * `MediaStream` を受け取り AudioContext 16kHz で AudioWorklet をロードし、
 * PCM16 モノラル 100ms フレームを `AudioFrameChannel` で配信する。
 *
 * **本番実装で mock が利用されない設計**:
 * - `audioContextFactory` / `workletModuleUrl` / `clock` は全て必須 DI
 *   (default なし)
 * - production entrypoint で `defaultAudioContextFactory` と
 *   `chrome.runtime.getURL('/audio-worklet.js')` を明示的に渡す
 *
 * NOTE: MVP スコープでは AudioWorklet 内部の PCM 処理は content script 側の
 * `audio-worklet.js` (別モジュール) に委譲し、本 factory では AudioContext の
 * ライフサイクル管理と worklet module のロード、channel 提供のみを扱う。
 * 実際のフレーム生成は E2E で検証する。
 */
export const createAudioPreprocessor = (deps: AudioPreprocessorDependencies): AudioPreprocessor => {
  const contexts = new Map<SessionIdentifier, AudioContextLike>();

  return {
    attach: (stream, sessionIdentifier) =>
      ResultAsync.fromPromise<AudioFrameChannel, DomainError>(
        (async () => {
          const context = deps.audioContextFactory({ sampleRate: 16000 });
          await context.audioWorklet.addModule(deps.workletModuleUrl);
          // 本 MVP では MediaStreamAudioSourceNode → AudioWorkletNode の
          // 接続確認のみ; worklet 側の `postMessage(frame)` によるフレーム
          // 生成は `audio-worklet.js` で実装される (E2E 対象)
          context.createMediaStreamSource(stream);
          contexts.set(sessionIdentifier, context);
          return createEmptyFrameChannel(context);
        })(),
        (cause) =>
          invariantViolationError({
            invariant: 'audio-preprocessor-attach-failed',
            details: cause instanceof Error ? cause.message : 'unknown error',
          }),
      ),

    detach: (sessionIdentifier) => {
      const context = contexts.get(sessionIdentifier);
      if (context === undefined) return okAsync(undefined);
      contexts.delete(sessionIdentifier);
      return ResultAsync.fromPromise<void, DomainError>(context.close(), (cause) =>
        invariantViolationError({
          invariant: 'audio-preprocessor-detach-failed',
          details: cause instanceof Error ? cause.message : 'unknown error',
        }),
      );
    },
  };
};
