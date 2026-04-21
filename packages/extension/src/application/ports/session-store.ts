import { type ResultAsync } from 'neverthrow';
import { type SessionIdentifier } from '../../domain/session/session-identifier';
import { type SourceSession } from '../../domain/session/source-session';
import { type DomainError } from '../../domain/shared/errors';
import { type TranscriptSegment } from '../../domain/transcript/transcript-segment';
import { type TranscriptStream } from '../../domain/transcript/transcript-stream';
import { type TranslationSegment } from '../../domain/transcript/translation-segment';

/**
 * セッションストアポート (DD-106)。
 *
 * IndexedDB に字幕・翻訳を非同期 append-only で永続化する抽象 interface
 * (DB-001〜004)。ホットパス外で実行され、失敗時も UI 表示・翻訳フローは
 * 継続する結果整合設計 (CLAUDE.md §ホットパス最優先原則)。
 *
 * エラー:
 * - `saveSession` / `appendTranscript` / `appendTranslation`: storage 書き込み
 *   失敗時 `invariantViolationError({ invariant: 'session-persistence' })`
 *   を想定。呼び出し側は WARN ログに留め、ホットパスを落とさない
 * - `loadExportBundle`: 指定セッションが存在しない場合
 *   `notFoundError({ resourceType: 'SourceSession', identifier })` を Err
 */
export type ExportBundle = Readonly<{
  session: SourceSession;
  stream: TranscriptStream;
}>;

export type SessionStore = Readonly<{
  saveSession: (session: SourceSession) => ResultAsync<void, DomainError>;
  appendTranscript: (
    sessionIdentifier: SessionIdentifier,
    segment: TranscriptSegment,
  ) => ResultAsync<void, DomainError>;
  appendTranslation: (
    sessionIdentifier: SessionIdentifier,
    translation: TranslationSegment,
  ) => ResultAsync<void, DomainError>;
  loadExportBundle: (
    sessionIdentifier: SessionIdentifier,
  ) => ResultAsync<ExportBundle, DomainError>;
}>;
