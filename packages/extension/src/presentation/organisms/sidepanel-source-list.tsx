import { mapSessionStateToWaveformMode } from '../molecules/session-state-mapper';
import { SourceCard } from '../molecules/source-card';
import type { ActiveSessionSummary } from '../hooks/use-active-sessions';

type Props = Readonly<{
  sessions: readonly ActiveSessionSummary[];
}>;

/**
 * SidePanelSourceList organism (perapera-scenes.jsx SidePanelScene 移植)。
 *
 * 各 ActiveSessionSummary を SourceCard として縦に並べる。空時は dim な
 * placeholder 文言を表示。
 */
export function SidePanelSourceList(props: Props) {
  if (props.sessions.length === 0) {
    return (
      <div
        className="container"
        data-component="sidepanel-source-list"
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          color: 'var(--pp-text-dim)',
          fontSize: 12.5,
          textAlign: 'center',
        }}
      >
        セッションがありません。Popup または Main window から開始してください。
      </div>
    );
  }
  return (
    <div
      className="container"
      data-component="sidepanel-source-list"
      style={{
        flex: 1,
        overflow: 'auto',
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {props.sessions.map((session) => {
        const mode = mapSessionStateToWaveformMode(session.state, false);
        const source = session.sourceLanguage ?? 'EN-US';
        const target = session.targetLanguage ?? 'JA-JP';
        return (
          <SourceCard
            key={session.sessionId}
            name={session.displayName}
            pair={[source, target]}
            state={session.state}
            mode={mode}
          />
        );
      })}
    </div>
  );
}
