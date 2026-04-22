import { useBackgroundCommand } from '../hooks/use-background-command';
import { useBackgroundQuery } from '../hooks/use-background-query';
import { type BackgroundClient } from '../infrastructure/background-client';
import { SessionListItem } from '../molecules/session-list-item';

export type Props = Readonly<{
  client: BackgroundClient;
  intervalMs?: number;
  onSessionChanged?: () => void;
}>;

/**
 * IMPL-541 ActiveSessionList organism。
 *
 * `useBackgroundQuery` で `GetSessionMonitorStateQuery` を polling し、
 * SessionListItem のリストを表示。Stop クリックで
 * `BackgroundClient.stopSourceSession` を呼び、成功時は即座に refetch して
 * リスト更新。`onSessionChanged` で Popup App 側に変化を伝える。
 */
export function ActiveSessionList(props: Props) {
  const query = useBackgroundQuery(props.client.getSessionMonitorState, {
    input: { includeOverlayState: false },
    intervalMs: props.intervalMs ?? 2000,
  });
  const stopCommand = useBackgroundCommand(props.client.stopSourceSession);

  const handleStop = async (sessionId: string): Promise<void> => {
    const response = await stopCommand.execute({ sessionId });
    if (response.ok) {
      await query.refetch();
      if (props.onSessionChanged !== undefined) props.onSessionChanged();
    }
  };

  if (
    query.state.status === 'idle' ||
    (query.state.status === 'pending' && query.state.data === null)
  ) {
    return <p className="message">読み込み中…</p>;
  }
  const sessions = query.state.data?.sessions ?? [];
  if (sessions.length === 0) {
    return <p className="message">稼働中のセッションはありません。</p>;
  }
  return (
    <div className="list" role="list" aria-label="アクティブセッション一覧">
      {sessions.map((session) => (
        <div key={session.sessionId} role="listitem">
          <SessionListItem
            session={session}
            disabled={stopCommand.state.status === 'pending'}
            onStop={(sessionId) => {
              void handleStop(sessionId);
            }}
          />
        </div>
      ))}
      {stopCommand.state.status === 'error' ? (
        <p className="message" role="alert">
          停止に失敗しました: {stopCommand.state.error.message}
        </p>
      ) : null}
    </div>
  );
}
