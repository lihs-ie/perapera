import { useEffect, useMemo } from 'react';
import { SourceIcon } from '../../presentation/atoms/icons/source-icon';
import { useActiveSessions } from '../../presentation/hooks/use-active-sessions';
import { createBackgroundClient } from '../../presentation/infrastructure/background-client';
import { PopupActiveList } from '../../presentation/organisms/popup-active-list';

/**
 * Popup app (perapera-scenes.jsx PopupScene 移植)。
 *
 * 340×420 のコンパクトなコントロールパネル。上部にソース追加ボタン (タブ/マイク)、
 * 中央に ACTIVE セッション一覧、下部に「サイドパネルを開く」CTA。
 *
 * background への command:
 * - `window.open-main`: action click 代わりに main window を起動。`activeTabId`
 *   を含めて送ることで、background が `chrome.storage.session.lastActiveTabId`
 *   に保存し、main window 側 StartSessionForm が tab capture 元として参照できる
 *   (action.default_popup を有効化したことで `chrome.action.onClicked` が発火
 *   しなくなった代替策)。
 * - `window.open-sidepanel`: chrome.sidePanel.open() を実行
 */
export function PopupApp() {
  const client = useMemo(() => createBackgroundClient(), []);
  const sessions = useActiveSessions(client);

  // popup 起動直後に active tab を取得して storage に保存しておく。
  // 「タブを追加」を押す前に main window が開く / hover 中に focus が変わる等の
  // race を避けるためのバックアップ。
  useEffect(() => {
    void chrome.tabs
      .query({ active: true, lastFocusedWindow: true, windowType: 'normal' })
      .then(([tab]) => {
        if (typeof tab?.id === 'number') {
          void chrome.runtime.sendMessage({ type: 'popup.context', activeTabId: tab.id });
        }
      });
  }, []);

  const openMain = async (): Promise<void> => {
    let activeTabId: number | undefined;
    try {
      const tabs = await chrome.tabs.query({
        active: true,
        lastFocusedWindow: true,
        windowType: 'normal',
      });
      if (typeof tabs[0]?.id === 'number') {
        activeTabId = tabs[0].id;
      }
    } catch {
      // chrome.tabs.query に失敗しても storage 経由の fallback がある
    }
    await chrome.runtime.sendMessage({
      type: 'window.open-main',
      ...(activeTabId !== undefined ? { activeTabId } : {}),
    });
    window.close();
  };

  const handleAddTab = (): void => {
    void openMain();
  };
  const handleAddMic = (): void => {
    void openMain();
  };
  const handleOpenSidePanel = (): void => {
    void chrome.runtime.sendMessage({ type: 'window.open-sidepanel' });
    window.close();
  };

  return (
    <div
      className="container"
      data-component="popup-app"
      style={{
        width: 340,
        height: 420,
        background: 'var(--pp-bg)',
        color: 'var(--pp-text-primary)',
        fontFamily: 'var(--pp-font-body)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <header
        style={{
          padding: '14px 14px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          borderBottom: '1px solid var(--pp-border)',
        }}
      >
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            onClick={handleAddTab}
            style={{
              flex: 1,
              padding: 10,
              background: 'var(--pp-accent)',
              color: 'var(--pp-accent-fg)',
              border: 'none',
              borderRadius: 6,
              fontWeight: 600,
              fontSize: 12,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              fontFamily: 'var(--pp-font-body)',
            }}
          >
            <SourceIcon kind="tab" />
            タブを追加
          </button>
          <button
            type="button"
            onClick={handleAddMic}
            style={{
              flex: 1,
              padding: 10,
              background: 'transparent',
              color: 'var(--pp-text-primary)',
              border: '1px solid var(--pp-border)',
              borderRadius: 6,
              fontWeight: 500,
              fontSize: 12,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              fontFamily: 'var(--pp-font-body)',
            }}
          >
            <SourceIcon kind="microphone" />
            マイク
          </button>
        </div>
      </header>
      <PopupActiveList sessions={sessions} />
      <button
        type="button"
        onClick={handleOpenSidePanel}
        style={{
          margin: 12,
          padding: 8,
          background: 'transparent',
          border: '1px solid var(--pp-border)',
          color: 'var(--pp-text-muted)',
          borderRadius: 6,
          fontSize: 11.5,
          fontWeight: 500,
          cursor: 'pointer',
          fontFamily: 'var(--pp-font-body)',
        }}
      >
        サイドパネルを開く →
      </button>
    </div>
  );
}
