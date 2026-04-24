import { useCallback, useEffect, useMemo, useState } from 'react';
import { type StartSourceSessionInput } from '../../application/dto/start-source-session-dto';
import { useBackgroundQuery } from '../../presentation/hooks/use-background-query';
import {
  createBackgroundClient,
  type StartSourceSessionResult,
} from '../../presentation/infrastructure/background-client';
import { SessionHistoryView } from '../../presentation/organisms/session-history-view';
import { SessionToolbar, type ActiveSession } from '../../presentation/organisms/session-toolbar';
import { SettingsView } from '../../presentation/organisms/settings-view';
import { StartSessionForm } from '../../presentation/organisms/start-session-form';
import { TranscriptPairStream } from '../../presentation/organisms/transcript-pair-stream';
import { MainWindowTemplate } from '../../presentation/templates/main-window-template';
import { useAudioLevel } from './use-audio-level';
import { useOverlayMessages } from './use-overlay-messages';

/**
 * Main window App。独立 floating window として開き、
 * - session 未開始時: `StartSessionForm` を表示
 * - session 開始後: `SessionToolbar` + `TranscriptPairStream` を表示
 * - `⚙` クリック時: `SettingsView` を container 全体に差し替えて表示
 *
 * ChromeMessagingOverlayPresenter (`chrome.runtime.sendMessage`) から
 * broadcast される `OverlayCommand` を `useOverlayMessages` hook で受け取り、
 * React state に反映する。対象タブへの content script 注入は行わない。
 */
export function App() {
  const client = useMemo(() => createBackgroundClient(), []);
  const overlay = useOverlayMessages();
  const audio = useAudioLevel();
  const defaultSettingsQuery = useBackgroundQuery(() => client.getDefaultSettings(), {
    input: undefined,
  });
  const [active, setActive] = useState<ActiveSession | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const handleStarted = useCallback(
    (result: StartSourceSessionResult, input: StartSourceSessionInput) => {
      setActive({
        sessionId: result.sessionId,
        displayName: input.displayName,
        state: result.state,
      });
    },
    [],
  );

  const handleStopped = useCallback(() => {
    setActive(null);
  }, []);

  const openSettings = useCallback(() => {
    setShowSettings(true);
  }, []);
  const closeSettings = useCallback(() => {
    setShowSettings(false);
  }, []);
  const openHistory = useCallback(() => {
    setShowHistory(true);
  }, []);
  const closeHistory = useCallback(() => {
    setShowHistory(false);
  }, []);

  useEffect(() => {
    if (overlay.sessionIdentifier === null) {
      setActive(null);
    }
  }, [overlay.sessionIdentifier]);

  // Issue #108: Relay からの session.state.changed で active.state を最新化。
  // `stopped` を受信したら自動で idle 画面に戻す (form 表示)。
  useEffect(() => {
    const nextState = overlay.sessionState;
    if (nextState === null) return;
    if (nextState === 'stopped') {
      setActive(null);
      return;
    }
    setActive((current) => {
      if (current === null) return current;
      if (overlay.sessionIdentifier !== null && current.sessionId !== overlay.sessionIdentifier) {
        return current;
      }
      if (current.state === nextState) return current;
      return { ...current, state: nextState };
    });
  }, [overlay.sessionState, overlay.sessionIdentifier]);

  if (showSettings) {
    return (
      <SettingsView
        client={client}
        onClose={() => {
          closeSettings();
          void defaultSettingsQuery.refetch();
        }}
      />
    );
  }

  if (showHistory) {
    return <SessionHistoryView client={client} onClose={closeHistory} />;
  }

  const defaultLanguagePair = defaultSettingsQuery.state.data?.languagePair ?? null;
  const formKey =
    defaultLanguagePair !== null
      ? `${defaultLanguagePair.source}:${defaultLanguagePair.target}`
      : 'loading';
  const formSlot = (
    <>
      <StartSessionForm
        key={formKey}
        client={client}
        onStarted={handleStarted}
        initialSourceLanguage={defaultLanguagePair?.source}
        initialTargetLanguage={defaultLanguagePair?.target}
      />
      <button
        type="button"
        className="historyButton"
        aria-label="セッション履歴を開く"
        onClick={openHistory}
      >
        過去のセッションを見る
      </button>
    </>
  );
  const toolbarSlot =
    active !== null ? (
      <SessionToolbar
        client={client}
        session={active}
        stateReason={overlay.sessionStateReason}
        audioLevel={audio.rms}
        audioIsSilent={audio.isSilent}
        onStopped={handleStopped}
        onOpenSettings={openSettings}
      />
    ) : null;
  const streamSlot = <TranscriptPairStream lines={overlay.lines} />;

  return (
    <MainWindowTemplate
      isActive={active !== null}
      formSlot={formSlot}
      toolbarSlot={toolbarSlot}
      streamSlot={streamSlot}
      onOpenSettings={openSettings}
    />
  );
}
