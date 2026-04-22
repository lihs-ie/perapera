import { useMemo } from 'react';
import { ActiveSessionDetailList } from '../../presentation/organisms/active-session-detail-list';
import { createBackgroundClient } from '../../presentation/infrastructure/background-client';
import { SidePanelTemplate } from '../../presentation/templates/side-panel-template';

const readVersionFromManifest = (): string | undefined => {
  try {
    const manifest = chrome.runtime.getManifest();
    return typeof manifest.version === 'string' ? manifest.version : undefined;
  } catch {
    return undefined;
  }
};

/**
 * IMPL-553 SidePanel App entry。
 *
 * Background messaging client を 1 回だけ生成し、`SidePanelTemplate` に
 * `ActiveSessionDetailList` を差し込む。Side Panel は持続表示前提のため、
 * polling intervalMs は default (2 秒) のまま。
 */
export function App() {
  const client = useMemo(() => createBackgroundClient(), []);
  const version = readVersionFromManifest();
  const listSlot = <ActiveSessionDetailList client={client} />;

  if (version !== undefined) {
    return <SidePanelTemplate version={version} listSlot={listSlot} />;
  }
  return <SidePanelTemplate listSlot={listSlot} />;
}
