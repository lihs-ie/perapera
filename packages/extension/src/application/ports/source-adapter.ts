import { type ResultAsync } from 'neverthrow';
import { type SessionIdentifier } from '../../domain/session/session-identifier';
import { type SourceType } from '../../domain/session/source-type';
import { type DomainError } from '../../domain/shared/errors';

/**
 * 音声ソース開始コマンド (DD-101〜103)。
 *
 * SourceType ごとに固有パラメータを持つ discriminated union。
 */
export type StartSourceCommand =
  | Readonly<{
      sourceType: 'tab';
      sessionIdentifier: SessionIdentifier;
      tabId?: number;
    }>
  | Readonly<{
      sourceType: 'microphone';
      sessionIdentifier: SessionIdentifier;
      deviceId?: string;
    }>
  | Readonly<{
      sourceType: 'desktop';
      sessionIdentifier: SessionIdentifier;
    }>;

/**
 * 音声ソースアダプタポート (DD-101〜103)。
 *
 * Chrome 拡張の 3 種類の音声取得 API (`chrome.tabCapture` /
 * `navigator.mediaDevices.getUserMedia` / `chrome.desktopCapture` +
 * `getDisplayMedia`) を統一した interface で抽象化する。
 *
 * エラー:
 * - `open`: 権限拒否 / ストリーム取得失敗時
 *   `invariantViolationError({ invariant: 'source-open-failed', ... })` を想定。
 *   権限拒否は `PermissionCoordinator` (IMPL-206) で事前に処理されるため、
 *   ここでは system-level の失敗 (API 不利用可能、タブ消失等) を主に扱う
 * - `close`: リソース解放失敗は警告レベル。基本的に ok(void) を返す
 */
export type SourceAdapter = Readonly<{
  open: (command: StartSourceCommand) => ResultAsync<MediaStream, DomainError>;
  close: (sessionIdentifier: SessionIdentifier) => ResultAsync<void, DomainError>;
}>;

/**
 * ソースアダプタファクトリ (DD-101〜103)。
 *
 * SourceType に応じた具体アダプタ (Tab / Microphone / Desktop) を返す純粋関数
 * ファクトリ。SessionCommandService がコマンド処理時に呼び出す。
 */
export type SourceAdapterFactory = Readonly<{
  create: (sourceType: SourceType) => SourceAdapter;
}>;
