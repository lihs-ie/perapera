import { type ResultAsync } from 'neverthrow';
import { type OverlaySettings } from '../../domain/profile/overlay-settings';
import { type SessionIdentifier } from '../../domain/session/session-identifier';
import { type DomainError } from '../../domain/shared/errors';
import { type SegmentIdentifier } from '../../domain/transcript/segment-identifier';

/**
 * オーバーレイの 1 行分の表示モデル。
 *
 * `originalText` / `translatedText` はそれぞれ `null` を許容し、
 * `OverlaySettings.showOriginalText` / `showTranslatedText` 設定に応じて
 * アプリケーション層で事前フィルタされる。
 *
 * IMPL-539 (v0.3):
 * - `precedingSegmentIdentifier`: 同一発話の直前 final の segmentId (時系列で
 *   隣接する final がある場合)。UI 側は dim 化 / fade で「続き」を視覚化する。
 *   partial や先頭 final では `null`。
 * - `hasTranslationContext`: 翻訳生成時に `precedingContext` を実際に参照した
 *   場合 `true`。UI で「文脈参照あり」のヒントアイコンを出すために使う。
 */
export type OverlayLine = Readonly<{
  segmentIdentifier: SegmentIdentifier;
  originalText: string | null;
  translatedText: string | null;
  targetLanguage: string | null;
  isFinal: boolean;
  precedingSegmentIdentifier: SegmentIdentifier | null;
  hasTranslationContext: boolean;
}>;

/**
 * オーバーレイへの描画モデル。特定セッションの最新字幕集合を渡す。
 */
export type OverlayRenderModel = Readonly<{
  sessionIdentifier: SessionIdentifier;
  lines: readonly OverlayLine[];
}>;

/**
 * オーバーレイ描画ポート (DD-108)。
 *
 * Content Script + Shadow DOM で対象ページに翻訳オーバーレイを表示する
 * 抽象 interface。ページ CSS 競合を避けるため Shadow DOM が前提。
 *
 * ライフサイクル:
 * - `mount`: セッション開始時に Shadow host を対象ページへ注入
 * - `render`: `transcript.partial` / `final` / `translation.final` 受信ごとに
 *   最新字幕モデルをプッシュ (ホットパス上)
 * - `updateSettings`: 利用者がオーバーレイ設定を変更した際に反映
 * - `unmount`: セッション停止時にリソースを解放
 *
 * エラー:
 * - `mount`: Shadow DOM ホスト作成失敗時
 *   `invariantViolationError({ invariant: 'overlay-mount-failed' })` を想定
 * - `render` 失敗はアプリケーション層で WARN ログに留める
 *   (UI 描画失敗がホットパスを止めないように)
 */
export type OverlayPresenter = Readonly<{
  mount: (sessionIdentifier: SessionIdentifier) => ResultAsync<void, DomainError>;
  render: (model: OverlayRenderModel) => ResultAsync<void, DomainError>;
  updateSettings: (
    sessionIdentifier: SessionIdentifier,
    settings: OverlaySettings,
  ) => ResultAsync<void, DomainError>;
  unmount: (sessionIdentifier: SessionIdentifier) => ResultAsync<void, DomainError>;
}>;
