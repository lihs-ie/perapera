import { type ResultAsync } from 'neverthrow';
import { type SessionIdentifier } from '../session/session-identifier';
import { type SourceSession } from '../session/source-session';
import { type DomainError } from '../shared/errors';

/**
 * ソースセッションリポジトリ (DD-260)。
 *
 * `SourceSession` 集約ルートの永続化契約。MVP では IndexedDB 内の `sessions`
 * object store にマッピングされる (DB-001)。`save` は create / update 双方で
 * 呼ばれる upsert セマンティクスを持つ。
 *
 * エラー:
 * - `findById`: 指定セッションが存在しない場合
 *   `notFoundError({ resourceType: 'SourceSession', identifier })` を Err で返す
 * - `findActiveSessions`: **0 件は `ok([])` で返す** (active セッションなしは
 *   正常ケース)。storage 読み込み整合失敗時は
 *   `invariantViolationError({ invariant: 'storage-read-integrity', ... })` を想定
 * - `save`: storage quota 超過等の書き込み失敗時は
 *   `invariantViolationError` を想定
 *
 * アクティブの定義は `domain/services/session-concurrency-policy.ts` の
 * `isActiveSession` に準拠 (`stopped` 以外の状態)。実装側が該当ロジックを
 * 再利用する。
 */
export type SourceSessionRepository = Readonly<{
  findById: (sessionIdentifier: SessionIdentifier) => ResultAsync<SourceSession, DomainError>;
  findActiveSessions: () => ResultAsync<readonly SourceSession[], DomainError>;
  /**
   * Issue #109: 履歴画面用に **stopped 含む全件** を取得する。
   * `findActiveSessions` がアクティブのみフィルタするのに対し、本メソッドは
   * フィルタせず IndexedDB の全レコードを返す。
   * 0 件は `ok([])`、整合失敗は `invariantViolationError` を返す。
   */
  findAllSessions: () => ResultAsync<readonly SourceSession[], DomainError>;
  save: (session: SourceSession) => ResultAsync<void, DomainError>;
}>;
