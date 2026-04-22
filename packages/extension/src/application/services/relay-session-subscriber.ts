import { type ResultAsync } from 'neverthrow';
import { type SessionIdentifier } from '../../domain/session/session-identifier';
import { type ApplicationError } from '../errors/application-errors';
import { type RelayEvent, type RelayGateway, type Unsubscribe } from '../ports/relay-gateway';

/**
 * IMPL-600 RelaySessionSubscriber (application service)。
 *
 * 各 `SourceSession` の開始・終了に合わせて `RelayGateway.subscribe` の登録と
 * 解除を管理する。受信したサーバーイベント (`RelayEvent`) は注入された
 * `handleEvent` 関数に dispatch し、transcript / translation / session.error
 * 各種のドメイン処理に接続する。
 *
 * `handleEvent` は通常 `SessionCommandService.handleRelayEvent` を late-bind
 * したもの (composition root の circular dependency 回避のため)。
 *
 * **本番実装で mock を使わない設計**:
 * - `relayGateway` / `handleEvent` は必須 DI
 * - test では fake gateway + fake handler を注入して subscribe / unsubscribe /
 *   dispatch 契約を検証
 *
 * **内部状態**:
 * - `Map<SessionIdentifier, Unsubscribe>` で active subscription を保持
 * - Service Worker 再起動で消失する性質は許容 (stateless 再登録を想定、
 *   後続 PR で session recovery と共に再接続する)
 */
export type RelaySessionSubscriber = Readonly<{
  /** Session start 時に呼び出す。既存 subscription は先に解除 (冪等) */
  start: (sessionIdentifier: SessionIdentifier) => void;
  /** Session stop 時に呼び出す。未登録 session は no-op */
  stop: (sessionIdentifier: SessionIdentifier) => void;
  /** SW shutdown / ExtensionApp.close 時に全解除 */
  stopAll: () => void;
  /** Active subscription 数 (test / metrics 用) */
  activeCount: () => number;
}>;

export type RelayEventHandler = (event: RelayEvent) => ResultAsync<void, ApplicationError>;

export type RelaySessionSubscriberDependencies = Readonly<{
  relayGateway: RelayGateway;
  handleEvent: RelayEventHandler;
  /** Err ログ sink。default console.warn */
  logWarn?: (message: string) => void;
}>;

const defaultLogWarn = (message: string): void => {
  console.warn(message);
};

export const createRelaySessionSubscriber = (
  deps: RelaySessionSubscriberDependencies,
): RelaySessionSubscriber => {
  const subscriptions = new Map<SessionIdentifier, Unsubscribe>();
  const logWarn = deps.logWarn ?? defaultLogWarn;

  const dispatchEvent = (event: RelayEvent): void => {
    void deps.handleEvent(event).match(
      () => undefined,
      (error) => {
        logWarn(
          `[perapera] relay-session-subscriber handleEvent failed: ${error.type}: ${error.message}`,
        );
      },
    );
  };

  const release = (sessionIdentifier: SessionIdentifier): void => {
    const existing = subscriptions.get(sessionIdentifier);
    if (existing === undefined) return;
    try {
      existing();
    } catch (cause) {
      logWarn(
        `[perapera] relay-session-subscriber unsubscribe failed for ${sessionIdentifier}: ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
      );
    }
    subscriptions.delete(sessionIdentifier);
  };

  return {
    start: (sessionIdentifier) => {
      release(sessionIdentifier);
      const unsubscribe = deps.relayGateway.subscribe(sessionIdentifier, dispatchEvent);
      subscriptions.set(sessionIdentifier, unsubscribe);
    },
    stop: (sessionIdentifier) => {
      release(sessionIdentifier);
    },
    stopAll: () => {
      for (const [sessionIdentifier] of subscriptions) {
        release(sessionIdentifier);
      }
    },
    activeCount: () => subscriptions.size,
  };
};
