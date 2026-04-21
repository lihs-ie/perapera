import { type ResultAsync } from 'neverthrow';
import { type SessionIdentifier } from '../../domain/session/session-identifier';
import { type DomainError } from '../../domain/shared/errors';

/**
 * 音声フレームエンベロープ (DD-104)。
 *
 * AudioWorklet で前処理した PCM16 モノラル 16kHz 100ms フレームの搬送形式。
 * Relay API (DD-401) へ audio.frame メッセージとして送信される。
 */
export type AudioFrameEnvelope = Readonly<{
  sessionIdentifier: SessionIdentifier;
  sequenceNumber: number;
  sampleRate: 16000;
  channels: 1;
  pcm16Base64: string;
  capturedAt: string;
  durationMs: number;
}>;

/**
 * PCM フレーム配信チャネル。
 * `frames` は AsyncIterable で毎 100ms に新しいフレームを yield する。
 * `close` は購読者がチャネルを明示的に終了する際に呼ぶ (AudioContext の
 * クリーンアップをトリガ)。
 */
export type AudioFrameChannel = Readonly<{
  frames: AsyncIterable<AudioFrameEnvelope>;
  close: () => void;
}>;

/**
 * 音声前処理ポート (DD-104)。
 *
 * `MediaStream` を受け取り AudioWorklet でモノラル化 / 16kHz リサンプリング /
 * 100ms PCM16 フレーム化を行い、`AudioFrameChannel` として配信する。
 *
 * ホットパス最重要 (infrastructure.md §10.1): 音声フレーム化は 100ms 以内に
 * 完了することが性能要件。
 *
 * エラー:
 * - `attach`: AudioContext 取得失敗 / AudioWorklet ロード失敗時は
 *   `invariantViolationError({ invariant: 'audio-context-unavailable' })` を想定
 */
export type AudioPreprocessor = Readonly<{
  attach: (
    stream: MediaStream,
    sessionIdentifier: SessionIdentifier,
  ) => ResultAsync<AudioFrameChannel, DomainError>;
  detach: (sessionIdentifier: SessionIdentifier) => ResultAsync<void, DomainError>;
}>;
