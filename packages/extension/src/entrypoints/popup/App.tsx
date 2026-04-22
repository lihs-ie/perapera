import { useCallback, useMemo } from 'react';
import { ActiveSessionList } from '../../presentation/organisms/active-session-list';
import { StartSessionForm } from '../../presentation/organisms/start-session-form';
import { PopupTemplate } from '../../presentation/templates/popup-template';
import { createBackgroundClient } from '../../presentation/infrastructure/background-client';

const readVersionFromManifest = (): string | undefined => {
  try {
    const manifest = chrome.runtime.getManifest();
    return typeof manifest.version === 'string' ? manifest.version : undefined;
  } catch {
    return undefined;
  }
};

/**
 * IMPL-551 Popup App entry。
 *
 * Background messaging client を 1 回だけ生成し、`PopupTemplate` に form /
 * active list の organisms を差し込む。source 追加 / start / stop の導線を
 * MVP 最小実装で提供する。
 *
 * session 追加時は ActiveSessionList 側の polling (既定 2 秒) で自動反映
 * される。`onStarted` は即時反映したい場合のフックとして残す (現段階は no-op)。
 */
export function App() {
  const client = useMemo(() => createBackgroundClient(), []);
  const version = readVersionFromManifest();

  const handleStarted = useCallback(() => {
    // 追加 session は ActiveSessionList の polling (既定 2s) で反映される
  }, []);

  const formSlot = <StartSessionForm client={client} onStarted={handleStarted} />;
  const listSlot = <ActiveSessionList client={client} />;

  if (version !== undefined) {
    return <PopupTemplate version={version} formSlot={formSlot} listSlot={listSlot} />;
  }
  return <PopupTemplate formSlot={formSlot} listSlot={listSlot} />;
}
