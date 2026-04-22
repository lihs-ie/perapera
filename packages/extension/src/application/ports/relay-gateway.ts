import { type ResultAsync } from 'neverthrow';
import { type SessionIdentifier } from '../../domain/session/session-identifier';
import { type SessionState } from '../../domain/session/session-state';
import { type SourceSession } from '../../domain/session/source-session';
import { type DomainError } from '../../domain/shared/errors';
import { type AudioFrameEnvelope } from './audio-preprocessor';

/**
 * Relay API から受信するサーバーイベント (DD-401 / api-specification.md §6.3)。
 *
 * 全イベントに `sessionIdentifier` を含めて subscribe 側で絞り込み可能に
 * する。`session.error` は `retryable` / `fatal` フラグで取り扱いを分岐。
 */
export type RelayEvent =
  | Readonly<{
      type: 'session.ready';
      sessionIdentifier: SessionIdentifier;
      heartbeatIntervalSec: number;
    }>
  | Readonly<{
      type: 'transcript.partial';
      sessionIdentifier: SessionIdentifier;
      segmentIdentifier: string;
      revision: number;
      text: string;
    }>
  | Readonly<{
      type: 'transcript.final';
      sessionIdentifier: SessionIdentifier;
      segmentIdentifier: string;
      text: string;
      finalizedAt: string;
    }>
  | Readonly<{
      type: 'translation.final';
      sessionIdentifier: SessionIdentifier;
      segmentIdentifier: string;
      translationIdentifier: string;
      targetLanguage: string;
      text: string;
    }>
  | Readonly<{
      type: 'session.state.changed';
      sessionIdentifier: SessionIdentifier;
      state: SessionState;
    }>
  | Readonly<{
      type: 'session.error';
      sessionIdentifier: SessionIdentifier;
      code: string;
      message: string;
      retryable: boolean;
      fatal: boolean;
    }>;

export type RelayEventListener = (event: RelayEvent) => void;
export type Unsubscribe = () => void;

/**
 * Relay WebSocket ゲートウェイポート (DD-401)。
 *
 * `packages/relay-api` への制御メッセージ送信とサーバーイベント購読を抽象化
 * する。WebSocket の接続確立は `openSession` 内で実行し、`subscribe` で
 * 購読者に配信する。ホットパス最重要 (audio.frame 送信 ≤50ms、infrastructure.md
 * §10.1)。
 *
 * エラー:
 * - `openSession`: ハンドシェイク失敗 / stream token 拒否時
 *   `invariantViolationError({ invariant: 'relay-handshake-failed' })` を想定
 * - `sendAudioFrame`: WebSocket 切断時は即座に Err (再接続は呼び出し側が
 *   `openSession` 再試行で対応)
 * - `closeSession`: 正常クローズ。失敗しても ok(void) で済ませる
 *
 * 購読:
 * - `subscribe` は同期的に listener を登録し、`Unsubscribe` 関数を返す。
 *   呼び出し側は session lifecycle の終了時に必ず unsubscribe する
 */
export type RelayGateway = Readonly<{
  openSession: (session: SourceSession) => ResultAsync<void, DomainError>;
  sendAudioFrame: (frame: AudioFrameEnvelope) => ResultAsync<void, DomainError>;
  closeSession: (sessionIdentifier: SessionIdentifier) => ResultAsync<void, DomainError>;
  subscribe: (sessionIdentifier: SessionIdentifier, listener: RelayEventListener) => Unsubscribe;
}>;
