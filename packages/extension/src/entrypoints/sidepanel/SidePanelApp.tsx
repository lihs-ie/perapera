import { useMemo } from 'react';
import { ExportIcon } from '../../presentation/atoms/icons/export-icon';
import { SettingsIcon } from '../../presentation/atoms/icons/settings-icon';
import { IconButton } from '../../presentation/atoms/icon-button';
import { PPMark } from '../../presentation/atoms/pp-mark';
import { useActiveSessions } from '../../presentation/hooks/use-active-sessions';
import { createBackgroundClient } from '../../presentation/infrastructure/background-client';
import { SidePanelSourceList } from '../../presentation/organisms/sidepanel-source-list';

/**
 * SidePanel app (perapera-scenes.jsx SidePanelScene 移植)。
 *
 * Chrome の Side Panel API 経由で開く 420px 幅のサイドパネル。
 * 上部に PPMark + Sources + IconButton(エクスポート/設定)、
 * 中央に各 active session の SourceCard 一覧。
 *
 * 設定/エクスポート は main window で扱うため、ここではボタンクリックで
 * `chrome.runtime.sendMessage({ type: 'window.open-main' })` を送るだけ。
 */
export function SidePanelApp() {
  const client = useMemo(() => createBackgroundClient(), []);
  const sessions = useActiveSessions(client);

  const handleOpenMain = (): void => {
    void chrome.runtime.sendMessage({ type: 'window.open-main' });
  };

  return (
    <div
      className="container"
      data-component="sidepanel-app"
      style={{
        width: '100%',
        height: '100vh',
        background: 'var(--pp-bg)',
        color: 'var(--pp-text-primary)',
        fontFamily: 'var(--pp-font-body)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <header
        style={{
          padding: '14px 16px',
          borderBottom: '1px solid var(--pp-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <PPMark size={18} />
        <h1
          style={{
            margin: 0,
            flex: 1,
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--pp-text-primary)',
          }}
        >
          Sources
        </h1>
        <IconButton label="エクスポート" onClick={handleOpenMain}>
          <ExportIcon size={14} />
        </IconButton>
        <IconButton label="設定" onClick={handleOpenMain}>
          <SettingsIcon size={14} />
        </IconButton>
      </header>
      <SidePanelSourceList sessions={sessions} />
    </div>
  );
}
