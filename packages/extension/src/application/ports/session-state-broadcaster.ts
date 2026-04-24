import { type ResultAsync } from 'neverthrow';
import { type SessionIdentifier } from '../../domain/session/session-identifier';
import { type SessionState } from '../../domain/session/session-state';
import { type DomainError } from '../../domain/shared/errors';

/**
 * Issue #108: Relay からの `session.state.changed` を main window (popup /
 * sidepanel / floating window) へ push するためのポート。
 *
 * - 配信先は `chrome.runtime.sendMessage` ベースの broadcast を想定
 * - ホットパス上 (translate / overlay 経路) には影響を与えず、状態遷移時の
 *   1 ショットイベントとして扱う
 * - 失敗 (受信者ゼロを含む) は呼び出し側で握り潰す前提 (warn ログのみ)
 */
export type SessionStateChangedEvent = Readonly<{
  sessionIdentifier: SessionIdentifier;
  state: SessionState;
  reason: string | null;
}>;

export type SessionStateBroadcaster = Readonly<{
  broadcast: (event: SessionStateChangedEvent) => ResultAsync<void, DomainError>;
}>;
