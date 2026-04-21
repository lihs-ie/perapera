import { type ResultAsync } from 'neverthrow';
import { type RelaySession } from '../../domain/session/relay-session';
import { type SessionIdentifier } from '../../domain/session/session-identifier';
import { type DomainError } from '../../domain/shared/errors';

/**
 * Relay Session repository port (IMPL-400 派生)。
 *
 * 対応: infrastructure 層の in-memory / Redis / DB いずれでも実装可能。MVP は
 * in-memory を想定 (Cloud Run 単一インスタンス前提)。スケール後は Redis 等で
 * 共有化する (infrastructure.md §5.1 "メモリ正本")。
 *
 * ライフサイクル:
 * - `save`: `POST /sessions` 成功時、state 遷移時
 * - `find`: `GET /sessions/:id`、WebSocket 接続時の認可チェック
 * - `delete`: expiresAt 経過時 (cleanup task)
 */
export type RelaySessionRepository = Readonly<{
  save: (session: RelaySession) => ResultAsync<void, DomainError>;
  find: (sessionIdentifier: SessionIdentifier) => ResultAsync<RelaySession | null, DomainError>;
  delete: (sessionIdentifier: SessionIdentifier) => ResultAsync<void, DomainError>;
}>;
