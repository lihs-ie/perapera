import { type Result, type ResultAsync } from 'neverthrow';
import { type DomainError } from '../../domain/shared/errors';

/**
 * STT ストリーム配信の transcript イベント (DD-402)。
 *
 * - `partial`: 暫定字幕。同一 `segmentId` で複数回発行され、`revision` は
 *   単調増加。`text` は最新全文を表す (差分ではなく累積)
 * - `final`: 確定字幕。1 つの `segmentId` につき 1 回発行される
 */
/**
 * IMPL-449: STT プロバイダが final と判定した理由。adapter が provider 固有信号
 * (例: Deepgram `speech_final`) をこの列挙へ正規化する。プロバイダが信号を
 * 返さない場合は `provider_default` に落として後方互換を保つ。
 */
export type EndpointingTrigger = 'silence' | 'punctuation' | 'max_duration' | 'provider_default';

export type TranscriptEvent =
  | Readonly<{
      type: 'partial';
      segmentId: string;
      revision: number;
      text: string;
      language: string | null;
      startOffsetMs: number;
      endOffsetMs: number;
    }>
  | Readonly<{
      type: 'final';
      segmentId: string;
      text: string;
      language: string | null;
      startOffsetMs: number;
      endOffsetMs: number;
      finalizedAt: string;
      endpointingTrigger: EndpointingTrigger;
    }>;

/**
 * STT プロバイダに接続中のストリームハンドル。
 *
 * `sendFrame` は WebSocket 経由で受信した PCM フレームをプロバイダへ転送する。
 * `events` は AsyncIterable で transcript.* イベントを受け取る。`close` で
 * graceful close を行い、`events` の async iteration も終了する。
 *
 * 本 port の実装 (DD-412 StreamingSttProviderAdapter) はプロバイダごとに
 * 異なる wire format (WebSocket / gRPC) を隠蔽する。
 */
export type SttStreamHandle = Readonly<{
  sendFrame: (params: { audioBase64: string; chunkId: string }) => Result<void, DomainError>;
  close: () => ResultAsync<void, DomainError>;
  events: AsyncIterable<TranscriptEvent>;
}>;

/**
 * IMPL-447: STT プロバイダに渡す endpointing 設定 (DD-236)。プロバイダ別に
 * `silenceThresholdMs` / `punctuationAware` / `minUtteranceMs` を正規化する。
 * adapter 側で未対応フィールドは `logger.info` を残して無視する。
 */
export type SttEndpointingConfig = Readonly<{
  silenceThresholdMs: number;
  punctuationAware: boolean;
  minUtteranceMs: number;
}>;

/**
 * STT プロバイダポート (DD-402)。
 *
 * 1 セッション 1 ストリーム。`openStream` で接続し、以降は `SttStreamHandle`
 * 経由で frame 送信 / transcript 受信を行う。
 *
 * `endpointing` (IMPL-447) は provider-specific field へ adapter が変換する。
 */
export type SttPort = Readonly<{
  openStream: (config: {
    sourceLanguage: string | null;
    autoDetectLanguage: boolean;
    endpointing?: SttEndpointingConfig;
  }) => ResultAsync<SttStreamHandle, DomainError>;
}>;
