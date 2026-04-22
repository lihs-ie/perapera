import { type AudioContextLike } from './audio-preprocessor';

/**
 * IMPL-615 AudioWorkletNode abstraction (offscreen 側 port)。
 *
 * `AudioWorkletNode` の最小 contract。production の `AudioWorkletNode` は
 * structurally に本 interface を満たす。
 *
 * - `port.onmessage`: worklet processor からの postMessage を受ける
 *   (次 Step 2d-3 で frame 受信 callback を設定)
 * - `connect` / `disconnect`: audio graph の接続 / 切断
 *
 * 接続は offscreen-audio-host 内の安全な wrapper (`unknown` 経由) で行う。
 */
export type AudioWorkletNodeLike = {
  /**
   * port 自体は readonly (一度作られたら差し替え不可) だが、`port.onmessage` は
   * worklet processor からの postMessage を listen するため mutable に
   * (`workletNode.port.onmessage = listener` で代入可能)。
   */
  readonly port: {
    onmessage: ((event: MessageEvent<unknown>) => void) | null;
  };
  connect: (destination: AudioNode) => void;
  disconnect: () => void;
};

/**
 * WorkletNode factory port。offscreen-audio-host から DI 経由で呼ばれる。
 * production では `new AudioWorkletNode(context, processorName)` を wrap。
 * test では fake を注入する。
 */
export type WorkletNodeFactory = (
  context: AudioContextLike,
  processorName: string,
) => AudioWorkletNodeLike;

/**
 * Production `WorkletNodeFactory`。`context` は `AudioContext` 実体である前提で
 * `new AudioWorkletNode(context, processorName)` を呼ぶ。
 *
 * 注: `AudioContextLike` は structural type だが、`new AudioWorkletNode` の
 * 第 1 引数は `BaseAudioContext` が必要。production は AudioContext 実体が
 * 必ず注入される (defaultAudioContextFactory 経由)。offscreen でのみ使われるため。
 */
export const defaultWorkletNodeFactory: WorkletNodeFactory = (context, processorName) => {
  // production: AudioContext 実体 (AudioContextLike の supertype) を前提
  // test の fake では本 factory を呼ばず、専用 stub factory を注入する
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  const ctx = context as unknown as BaseAudioContext;
  return new AudioWorkletNode(ctx, processorName);
};
