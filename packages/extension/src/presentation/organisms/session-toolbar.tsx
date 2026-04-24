import { useState } from 'react';
import { Button } from '../atoms/button';
import { StatusBadge } from '../atoms/status-badge';
import { useBackgroundCommand } from '../hooks/use-background-command';
import { type BackgroundClient } from '../infrastructure/background-client';
import { ExportControls } from '../molecules/export-controls';

export type ActiveSession = Readonly<{
  sessionId: string;
  displayName: string;
  state: string;
}>;

export type Props = Readonly<{
  client: BackgroundClient;
  session: ActiveSession;
  /** Issue #108: Relay が `session.state.changed` に付与した補足理由 (degraded / error 時の banner で表示) */
  stateReason?: string | null;
  onStopped: () => void;
  /** `⚙` ボタン押下で設定画面を開く。未指定時は非表示 */
  onOpenSettings?: () => void;
}>;

const ABNORMAL_STATES = new Set<string>(['degraded', 'error', 'reconnecting']);

const stateBannerMessage = (state: string, reason: string | null | undefined): string | null => {
  if (!ABNORMAL_STATES.has(state)) return null;
  const base =
    state === 'degraded'
      ? '翻訳が一時停止しました。文字起こしのみ継続中です。'
      : state === 'reconnecting'
        ? 'Relay と再接続中です…'
        : 'セッションエラー: 復旧不能なエラーが発生しました。';
  return reason !== null && reason !== undefined && reason.length > 0
    ? `${base} (${reason})`
    : base;
};

/**
 * SessionToolbar organism。
 *
 * Main window 上段の toolbar。左側に `displayName` と `StatusBadge`、
 * 右側に停止ボタンを配置する。停止ボタン押下で
 * `BackgroundClient.stopSourceSession` を呼び、成功時に親の `onStopped` を
 * 呼んで idle 状態に戻す。
 */
export function SessionToolbar(props: Props) {
  const stopCommand = useBackgroundCommand(props.client.stopSourceSession);
  const isPending = stopCommand.state.status === 'pending';
  const [exportOpen, setExportOpen] = useState<boolean>(false);
  const banner = stateBannerMessage(props.session.state, props.stateReason);

  const handleStop = async (): Promise<void> => {
    const response = await stopCommand.execute({ sessionId: props.session.sessionId });
    if (response.ok) {
      props.onStopped();
    }
  };

  return (
    <header className="header">
      <div className="info">
        <span className="title" title={props.session.displayName}>
          {props.session.displayName}
        </span>
        <StatusBadge state={props.session.state} />
      </div>
      <div className="actions">
        {props.onOpenSettings !== undefined ? (
          <button
            type="button"
            className="iconButton"
            aria-label="設定を開く"
            onClick={props.onOpenSettings}
          >
            ⚙
          </button>
        ) : null}
        <button
          type="button"
          className="iconButton"
          aria-label="エクスポートを開く"
          aria-expanded={exportOpen}
          onClick={() => {
            setExportOpen((prev) => !prev);
          }}
        >
          {exportOpen ? '▾' : '↧'}
        </button>
        <Button
          variant="danger"
          disabled={isPending}
          ariaLabel="セッションを停止"
          onClick={() => {
            void handleStop();
          }}
        >
          {isPending ? '停止中…' : '停止'}
        </Button>
      </div>
      {exportOpen ? (
        <div className="panel" data-testid="export-panel">
          <ExportControls client={props.client} sessionId={props.session.sessionId} />
        </div>
      ) : null}
      {banner !== null ? (
        <div
          className="banner"
          role="alert"
          data-testid="session-state-banner"
          data-state={props.session.state}
        >
          {banner}
        </div>
      ) : null}
    </header>
  );
}
