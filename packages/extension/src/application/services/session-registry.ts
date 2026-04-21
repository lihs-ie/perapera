import { type SessionIdentifier } from '../../domain/session/session-identifier';
import { type SourceSession } from '../../domain/session/source-session';
import { isActiveSession } from '../../domain/specifications/concurrent-session-limit-specification';

/**
 * IMPL-342 SessionRegistry (detailed-design §2.2)。
 *
 * ソースセッションの **メモリ上の正本** (`正本` = authoritative copy)。
 * Service Worker のライフタイム内でアクティブセッションを即時参照する
 * ための in-memory 層。IndexedDB (`ExtensionSessionRepository` 実装) は
 * 永続化層で、registry は write-through の sync 層として機能する。
 *
 * 設計上の位置付け (infrastructure.md §5.1):
 * - セッション単位のメモリ整合: 本 registry を正とする
 * - ストレージへの遅延永続化: IndexedDB に追記保存する
 *
 * 用途:
 * - `findActive`: Concurrency 制限の事前判定 (`MAX_CONCURRENT_ACTIVE_SESSIONS`)
 * - `find`: RelayEvent 受信時の対象セッション参照
 * - `save` / `delete`: 状態遷移の即時反映
 */
export type SessionRegistry = Readonly<{
  find: (sessionIdentifier: SessionIdentifier) => SourceSession | undefined;
  save: (session: SourceSession) => void;
  delete: (sessionIdentifier: SessionIdentifier) => void;
  findActive: () => readonly SourceSession[];
  listAll: () => readonly SourceSession[];
  clear: () => void;
}>;

/**
 * `SessionRegistry` の factory。内部は `Map<SessionIdentifier, SourceSession>`。
 * Service Worker 再起動で消失する性質は許容 (永続化は IndexedDB 側が担う)。
 */
export const createSessionRegistry = (): SessionRegistry => {
  const sessions = new Map<SessionIdentifier, SourceSession>();

  return {
    find: (sessionIdentifier) => sessions.get(sessionIdentifier),
    save: (session) => {
      sessions.set(session.sessionIdentifier, session);
    },
    delete: (sessionIdentifier) => {
      sessions.delete(sessionIdentifier);
    },
    findActive: () => [...sessions.values()].filter((session) => isActiveSession(session)),
    listAll: () => [...sessions.values()],
    clear: () => {
      sessions.clear();
    },
  };
};
