import { type ResultAsync } from 'neverthrow';
import { type SessionIdentifier } from '../session/session-identifier';
import { type DomainError } from '../shared/errors';
import { type TranscriptSegment } from '../transcript/transcript-segment';
import { type TranscriptStream } from '../transcript/transcript-stream';
import { type TranslationSegment } from '../transcript/translation-segment';

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
}>;
