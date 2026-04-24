import { type ResultAsync } from 'neverthrow';
import { type TranscriptSearchQuery } from '../search';
import { type SessionIdentifier } from '../session/session-identifier';
import { type DomainError } from '../shared/errors';
import { type TranscriptSegment } from '../transcript/transcript-segment';
import { type TranscriptStream } from '../transcript/transcript-stream';
import { type TranslationSegment } from '../transcript/translation-segment';

/**
 * 字幕検索マッチ (DD-261, Issue #125)。
 *
 * 1 segment における検索ヒットを表す。`matchedLanguage` で原文 / 訳文を
 * 区別し、`snippet` は前後 20 文字を含むハイライト表示用の短文。
 */
export type TranscriptSearchMatch = Readonly<{
  sessionIdentifier: SessionIdentifier;
  segmentIdentifier: string;
  snippet: string;
  matchedLanguage: 'source' | 'target';
  startTimeMs: number;
}>;

/**
 * 字幕ストリームリポジトリ (DD-261)。
 *
 * `TranscriptStream` 集約の永続化契約。MVP では IndexedDB 内の
 * `transcript_segments` / `translation_segments` object store にマッピングされる
 * (DB-002 / DB-003)。append-only 設計 (CLAUDE.md §データ保存方針) に従い、
 * 集約全体を置き換える `save` は提供せず、細粒度 append 操作のみを公開する。
 *
 * ドメイン不変条件 (`domain/transcript/transcript-stream.ts` 参照) は集約側で
 * 既に保証されているため、リポジトリは完全なエンティティ値を受け取る契約。
 * infrastructure 側の防御チェックとして以下を期待する:
 *
 * - `appendFinal`: `segment.isFinal === true` を検証。違反時
 *   `invariantViolationError({ invariant: 'append-final-requires-final-segment' })`
 * - `appendTranslation`: 対応する final segment が存在することを検証。
 *   違反時 `invariantViolationError({ invariant: 'translation-requires-final-segment' })`
 *
 * エラー:
 * - `findBySessionId`: セッションに紐づくストリーム未作成時
 *   `notFoundError({ resourceType: 'TranscriptStream', identifier: sessionIdentifier })`
 */
export type TranscriptStreamRepository = Readonly<{
  findBySessionId: (
    sessionIdentifier: SessionIdentifier,
  ) => ResultAsync<TranscriptStream, DomainError>;
  appendPartial: (
    sessionIdentifier: SessionIdentifier,
    segment: TranscriptSegment,
  ) => ResultAsync<void, DomainError>;
  appendFinal: (
    sessionIdentifier: SessionIdentifier,
    segment: TranscriptSegment,
  ) => ResultAsync<void, DomainError>;
  appendTranslation: (
    sessionIdentifier: SessionIdentifier,
    translation: TranslationSegment,
  ) => ResultAsync<void, DomainError>;
  /**
   * 全セッション横断で transcript / translation の部分一致検索を行う (Issue #125)。
   * MVP は linear scan (`by-sessionId` index 経由で全セッション分を取得 → 部分
   * 一致判定)。将来的に `tokens` index で O(log n) 化する余地を残す。
   */
  search: (
    query: TranscriptSearchQuery,
  ) => ResultAsync<readonly TranscriptSearchMatch[], DomainError>;
  /**
   * ブックマーク toggle (Issue #126)。final 字幕のみ対象。partial への toggle
   * は `invariantViolationError({ invariant: 'bookmark-requires-final-segment' })`
   * を返す。存在しない segmentId は `notFoundError`。
   */
  toggleBookmark: (
    sessionIdentifier: SessionIdentifier,
    segmentId: string,
  ) => ResultAsync<void, DomainError>;
  /**
   * 全セッション横断で isBookmarked=true の final 字幕を取得する (Issue #126)。
   * 戻り値は startTimeMs 昇順 + sessionId でソート済。
   */
  findBookmarked: () => ResultAsync<readonly TranscriptSearchMatch[], DomainError>;
}>;
