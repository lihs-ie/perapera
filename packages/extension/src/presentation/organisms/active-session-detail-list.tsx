import { useBackgroundQuery } from '../hooks/use-background-query';
import { type BackgroundClient } from '../infrastructure/background-client';
import { SessionDetailCard } from './session-detail-card';

export type Props = Readonly<{
  client: BackgroundClient;
  /** polling 間隔 (ms)。default 2000 */
  intervalMs?: number;
}>;

/**
 * IMPL-543 ActiveSessionDetailList organism。
 *
 * SidePanel 向けのリッチ表示。`useBackgroundQuery` で
 * GetSessionMonitorState を polling し、各アクティブセッションに対して
 * `SessionDetailCard` を 1 つ展開する。SessionListItem (Popup 版) との違い:
 * - 最新字幕プレビュー付き (latestSegments を session 単位にフィルタ)
 * - Export コントロール付き
 */
export function ActiveSessionDetailList(props: Props) {
  const query = useBackgroundQuery(props.client.getSessionMonitorState, {
    input: { includeOverlayState: false },
    intervalMs: props.intervalMs ?? 2000,
  });

  if (
    query.state.status === 'idle' ||
    (query.state.status === 'pending' && query.state.data === null)
  ) {
    return <p className="message">読み込み中…</p>;
  }

  const sessions = query.state.data?.sessions ?? [];
  const latestSegments = query.state.data?.latestSegments ?? [];

  if (sessions.length === 0) {
    return <p className="message">稼働中のセッションはありません。</p>;
  }

  return (
    <div className="list" role="list" aria-label="アクティブセッション詳細一覧">
      {sessions.map((session) => (
        <div key={session.sessionId} role="listitem">
          <SessionDetailCard
            client={props.client}
            session={session}
            latestSegments={latestSegments}
            onStopped={() => {
              void query.refetch();
            }}
          />
        </div>
      ))}
      {query.state.status === 'error' && query.state.error !== null ? (
        <p className="message" role="alert">
          更新に失敗しました: {query.state.error.message}
        </p>
      ) : null}
    </div>
  );
}
