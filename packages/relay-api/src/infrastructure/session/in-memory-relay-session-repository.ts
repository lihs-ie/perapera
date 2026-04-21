import { okAsync, type ResultAsync } from 'neverthrow';
import { type RelaySessionRepository } from '../../application/ports/session-repository';
import { type RelaySession } from '../../domain/session/relay-session';
import { type SessionIdentifier } from '../../domain/session/session-identifier';
import { type DomainError } from '../../domain/shared/errors';

/**
 * `RelaySessionRepository` の in-memory 実装 (MVP)。
 *
 * Cloud Run 単一インスタンス前提の簡易実装。プロセス再起動で消失する。
 * スケール (複数インスタンス) 時は Redis 等の共有ストアへ差し替える。
 *
 * **本番実装で mock が利用されない設計**:
 * - 内部 Map は module-private。外部から観測できない (test は port 経由)
 * - production entrypoint で `createInMemoryRelaySessionRepository()` を明示
 *   的に呼び出して service に注入する
 */
export const createInMemoryRelaySessionRepository = (): RelaySessionRepository => {
  const store = new Map<SessionIdentifier, RelaySession>();
  return {
    save: (session: RelaySession): ResultAsync<void, DomainError> => {
      store.set(session.sessionIdentifier, session);
      return okAsync<void, DomainError>(undefined);
    },
    find: (sessionIdentifier: SessionIdentifier) => {
      const session = store.get(sessionIdentifier);
      return okAsync<RelaySession | null, DomainError>(session ?? null);
    },
    delete: (sessionIdentifier: SessionIdentifier) => {
      store.delete(sessionIdentifier);
      return okAsync<void, DomainError>(undefined);
    },
  };
};
