import { Button } from '../atoms/button';
import { StatusBadge } from '../atoms/status-badge';

export type SessionViewModel = Readonly<{
  sessionId: string;
  displayName: string;
  state: string;
  sourceType: string;
}>;

export type Props = Readonly<{
  session: SessionViewModel;
  onStop: (sessionId: string) => void;
  disabled?: boolean;
}>;

/**
 * IMPL-532 SessionListItem molecule。
 *
 * 1 件のアクティブセッションを表示する。displayName / state (StatusBadge) /
 * sourceType と Stop ボタン。onStop は sessionId を返す。
 */
export function SessionListItem(props: Props) {
  return (
    <div className="item" data-session-id={props.session.sessionId}>
      <div className="info">
        <span className="name">{props.session.displayName}</span>
        <span className="source">[{props.session.sourceType}]</span>
        <StatusBadge state={props.session.state} />
      </div>
      <Button
        variant="danger"
        disabled={props.disabled === true}
        ariaLabel={`${props.session.displayName} を停止`}
        onClick={() => {
          props.onStop(props.session.sessionId);
        }}
      >
        停止
      </Button>
    </div>
  );
}
