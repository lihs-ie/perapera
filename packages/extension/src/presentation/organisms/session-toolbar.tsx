import { useState } from 'react';
import { Button } from '../atoms/button';
import { ExportIcon } from '../atoms/icons/export-icon';
import { SettingsIcon } from '../atoms/icons/settings-icon';
import { IconButton } from '../atoms/icon-button';
import { StatusPill } from '../atoms/status-pill';
import { useBackgroundCommand } from '../hooks/use-background-command';
import { type BackgroundClient } from '../infrastructure/background-client';
import { ExportControls } from '../molecules/export-controls';
import { LanguagePairDisplay } from '../molecules/language-pair-display';
import {
  mapSessionStateToStatusPill,
  mapSessionStateToWaveformMode,
} from '../molecules/session-state-mapper';
import { ToolbarErrorBanner } from '../molecules/toolbar-error-banner';
import { ToolbarSilentBanner } from '../molecules/toolbar-silent-banner';
import { ToolbarWaveformRow } from '../molecules/toolbar-waveform-row';

export type ActiveSession = Readonly<{
  sessionId: string;
  displayName: string;
  state: string;
  sourceLanguage?: string;
  targetLanguage?: string;
}>;

export type Props = Readonly<{
  client: BackgroundClient;
  session: ActiveSession;
  stateReason?: string | null;
  audioLevel?: number;
  audioIsSilent?: boolean;
  onStopped: () => void;
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

const stateBannerVariant = (state: string): 'error' | 'warn' =>
  state === 'error' ? 'error' : 'warn';

/**
 * SessionToolbar organism (perapera-toolbar.jsx Toolbar 移植)。
 *
 * gradient 背景 (rgba(26,33,46,0.7) → rgba(19,25,36,0.95)) の上に、
 * 上段: displayName + StatusPill + IconButton(設定/エクスポート) + 停止ボタン、
 * 中段: LanguagePairDisplay (オプション)、
 * 下段: ToolbarWaveformRow (LIVE/Waveform/dB)、
 * 必要に応じて ToolbarErrorBanner (degraded/error/reconnecting) と
 * ToolbarSilentBanner (audioIsSilent) を重ねる。
 */
export function SessionToolbar(props: Props) {
  const stopCommand = useBackgroundCommand(props.client.stopSourceSession);
  const isPending = stopCommand.state.status === 'pending';
  const [exportOpen, setExportOpen] = useState(false);
  const banner = stateBannerMessage(props.session.state, props.stateReason);
  const audioLevel = props.audioLevel ?? 0;
  const audioIsSilent = props.audioIsSilent === true;
  const waveformMode = mapSessionStateToWaveformMode(props.session.state, audioIsSilent);
  const pillState = mapSessionStateToStatusPill(props.session.state);
  const handleStop = async (): Promise<void> => {
    const response = await stopCommand.execute({ sessionId: props.session.sessionId });
    if (response.ok) {
      props.onStopped();
    }
  };

  return (
    <header
      className="container"
      data-component="session-toolbar"
      style={{
        flexShrink: 0,
        borderBottom: '1px solid var(--pp-border)',
        background: 'linear-gradient(180deg, rgba(26,33,46,0.7) 0%, rgba(19,25,36,0.95) 100%)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '11px 16px 7px',
        }}
      >
        <div style={{ minWidth: 0, flex: '1 1 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span
              title={props.session.displayName}
              style={{
                fontSize: 13.5,
                fontWeight: 600,
                color: 'var(--pp-text-primary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: 200,
              }}
            >
              {props.session.displayName}
            </span>
            <StatusPill state={pillState} />
          </div>
          {props.session.sourceLanguage !== undefined &&
          props.session.targetLanguage !== undefined ? (
            <LanguagePairDisplay
              source={props.session.sourceLanguage}
              target={props.session.targetLanguage}
            />
          ) : null}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {props.onOpenSettings !== undefined ? (
            <IconButton label="設定を開く" onClick={props.onOpenSettings}>
              <SettingsIcon size={14} />
            </IconButton>
          ) : null}
          <IconButton label="エクスポートを開く" onClick={() => setExportOpen((prev) => !prev)}>
            <ExportIcon size={14} />
          </IconButton>
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
      </div>
      <ToolbarWaveformRow mode={waveformMode} audioLevel={audioLevel} />
      {banner !== null ? (
        <div data-testid="session-state-banner" data-state={props.session.state}>
          <ToolbarErrorBanner variant={stateBannerVariant(props.session.state)} message={banner} />
        </div>
      ) : null}
      {audioIsSilent && banner === null ? (
        <div data-testid="audio-silent-banner" data-variant="silence">
          <ToolbarSilentBanner />
        </div>
      ) : null}
      {exportOpen ? (
        <div
          data-testid="export-panel"
          style={{
            padding: '12px 16px',
            borderTop: '1px solid var(--pp-border)',
            background: 'var(--pp-bg-soft)',
          }}
        >
          <ExportControls client={props.client} sessionId={props.session.sessionId} />
        </div>
      ) : null}
    </header>
  );
}
