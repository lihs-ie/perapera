import { useMemo } from 'react';
import { Button } from '../atoms/button';
import { StatusBadge } from '../atoms/status-badge';
import { useBackgroundCommand } from '../hooks/use-background-command';
import {
  type BackgroundClient,
  type ExportSessionResultResult,
} from '../infrastructure/background-client';
import { ExportControls, type ExportControlsStatus } from '../molecules/export-controls';
import { TranscriptPreview, type TranscriptPreviewLine } from '../molecules/transcript-preview';

export type SessionDetailViewModel = Readonly<{
  sessionId: string;
  displayName: string;
  state: string;
  sourceType: string;
}>;

export type Props = Readonly<{
  client: BackgroundClient;
  session: SessionDetailViewModel;
  latestSegments: readonly TranscriptPreviewLine[];
  onStopped?: () => void;
  onExported?: (result: ExportSessionResultResult) => void;
}>;

const toStatus = (
  state: ReturnType<typeof useBackgroundCommand<never, ExportSessionResultResult>>['state'],
): ExportControlsStatus => {
  switch (state.status) {
    case 'idle':
      return { kind: 'idle' };
    case 'pending':
      return { kind: 'pending' };
    case 'success':
      return { kind: 'success', bytes: state.value.bytes };
    case 'error':
      return { kind: 'error', message: state.error.message };
  }
};

/**
 * IMPL-542 SessionDetailCard organism。
 *
 * 1 セッションの詳細表示 (SidePanel 用):
 * - ヘッダ: displayName + sourceType + StatusBadge
 * - 本体: 最新字幕プレビュー (TranscriptPreview)
 * - フッタ: Stop ボタン + ExportControls
 *
 * Stop / Export は BackgroundClient 経由で dispatch。結果を props.onStopped /
 * onExported で caller に伝える。エラー時はそのまま ExportControls の status で
 * UI 反映する (Stop 側の error 表示は SessionDetailCard 内で message として出す)。
 */
export function SessionDetailCard(props: Props) {
  const stopCommand = useBackgroundCommand(props.client.stopSourceSession);
  const exportCommand = useBackgroundCommand(props.client.exportSessionResult);

  const exportStatus = useMemo(() => toStatus(exportCommand.state), [exportCommand.state]);

  const handleStop = (): void => {
    void stopCommand.execute({ sessionId: props.session.sessionId }).then((response) => {
      if (response.ok && props.onStopped !== undefined) props.onStopped();
    });
  };

  return (
    <article className="card" aria-label={`${props.session.displayName} セッション詳細`}>
      <header className="header">
        <div className="info">
          <span className="name">{props.session.displayName}</span>
          <span className="source">[{props.session.sourceType}]</span>
          <StatusBadge state={props.session.state} />
        </div>
        <Button
          variant="danger"
          ariaLabel={`${props.session.displayName} を停止`}
          onClick={handleStop}
          disabled={stopCommand.state.status === 'pending'}
        >
          {stopCommand.state.status === 'pending' ? '停止中…' : '停止'}
        </Button>
      </header>
      <TranscriptPreview sessionId={props.session.sessionId} segments={props.latestSegments} />
      {stopCommand.state.status === 'error' ? (
        <p className="message" role="alert">
          停止に失敗しました: {stopCommand.state.error.message}
        </p>
      ) : null}
      <ExportControls
        sessionId={props.session.sessionId}
        status={exportStatus}
        onExport={(input) => {
          void exportCommand.execute(input).then((response) => {
            if (response.ok && props.onExported !== undefined) props.onExported(response.value);
          });
        }}
      />
    </article>
  );
}
