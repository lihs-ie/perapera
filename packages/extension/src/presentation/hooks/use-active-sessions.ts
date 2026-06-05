import { useBackgroundQuery } from './use-background-query';
import type { BackgroundClient } from '../infrastructure/background-client';

export type ActiveSessionSummary = Readonly<{
  sessionId: string;
  displayName: string;
  state: string;
  sourceLanguage?: string;
  targetLanguage?: string;
}>;

/**
 * Popup / SidePanel から複数 session の状態を購読する hook。
 *
 * `client.getSessionMonitorState` を一定間隔 (既定 1500ms) で poll し、
 * sessions 配列を返す。`useBackgroundQuery` の `intervalMs` で poll を制御する
 * ため、自前の setInterval は不要。
 */
export function useActiveSessions(
  client: BackgroundClient,
  pollMs = 1500,
): readonly ActiveSessionSummary[] {
  const query = useBackgroundQuery(
    () => client.getSessionMonitorState({ includeOverlayState: false }),
    {
      input: undefined,
      intervalMs: pollMs,
    },
  );
  const sessions = query.state.data?.sessions ?? [];
  return sessions.map((session) => ({
    sessionId: session.sessionId,
    displayName: session.displayName,
    state: session.state,
  }));
}
