import { mapSessionStateToWaveformMode } from '../molecules/session-state-mapper';
import { SourceRow } from '../molecules/source-row';
import type { ActiveSessionSummary } from '../hooks/use-active-sessions';

type Props = Readonly<{
  sessions: readonly ActiveSessionSummary[];
}>;

/**
 * PopupActiveList organism (perapera-scenes.jsx PopupScene の中段リスト 移植)。
 *
 * 「ACTIVE · N」ラベル + SourceRow 縦並び。空時は「ACTIVE · 0」のみ。
 * MiniWaveform の mode は session.state から `mapSessionStateToWaveformMode`
 * で導出 (audio silent 情報は popup で取れないので false 固定)。
 */
export function PopupActiveList(props: Props) {
  return (
    <div
      className="container"
      data-component="popup-active-list"
      style={{
        padding: '12px 14px',
        flex: 1,
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div
        data-part="label"
        style={{
          fontFamily: 'var(--pp-font-numeric)',
          fontSize: 9.5,
          letterSpacing: '0.14em',
          color: 'var(--pp-text-dim)',
          fontWeight: 500,
        }}
      >
        ACTIVE · {props.sessions.length}
      </div>
      {props.sessions.map((session) => {
        const mode = mapSessionStateToWaveformMode(session.state, false);
        const pair =
          session.sourceLanguage !== undefined && session.targetLanguage !== undefined
            ? `${session.sourceLanguage}→${session.targetLanguage}`
            : 'EN→JA';
        return (
          <SourceRow
            key={session.sessionId}
            name={session.displayName}
            pair={pair}
            state={session.state}
            mode={mode}
          />
        );
      })}
    </div>
  );
}
