import React, { useState } from 'react';
import { type StartSourceSessionInput } from '../../application/dto/start-source-session-dto';
import { type SourceType } from '../../domain/session/source-type';
import { Button } from '../atoms/button';
import { Checkbox } from '../atoms/checkbox';
import { Label } from '../atoms/label';
import { TextInput } from '../atoms/text-input';
import { useBackgroundCommand } from '../hooks/use-background-command';
import {
  type BackgroundClient,
  type StartSourceSessionResult,
} from '../infrastructure/background-client';
import { LanguagePairSelector } from '../molecules/language-pair-selector';
import { SourceTypeSelector } from '../molecules/source-type-selector';

/**
 * Active tab resolver。main window からは `currentWindow: true` だと main
 * window 自身の tab が返ってしまうため、以下の順で解決する:
 *
 * 1. `chrome.storage.session.lastActiveTabId` (background.ts の
 *    `chrome.action.onClicked` listener が記録した、activeTab granted 元)
 * 2. `chrome.tabs.query({ active: true, lastFocusedWindow: true })` (main
 *    window 以前に focus していた window の active tab)
 *
 * test では fake (vi.fn(() => Promise.resolve(42))) を注入可能。
 */
export type ActiveTabResolver = () => Promise<number | null>;

const defaultActiveTabResolver: ActiveTabResolver = async () => {
  try {
    const stored = await chrome.storage.session?.get('lastActiveTabId');
    if (stored !== undefined && typeof stored.lastActiveTabId === 'number') {
      console.log(
        '[start-session-form] resolved tabId from storage.session:',
        stored.lastActiveTabId,
      );
      return stored.lastActiveTabId;
    }
  } catch (cause) {
    console.warn('[start-session-form] storage.session.get failed:', cause);
  }
  try {
    // windowType: 'normal' で main window (popup type) を除外。main window が
    // lastFocusedWindow だと自身の main.html tab を誤って拾って tab capture が
    // 空になる問題を防ぐ。
    const tabs = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
      windowType: 'normal',
    });
    const first = tabs[0];
    if (typeof first?.id === 'number') {
      console.log('[start-session-form] resolved tabId via chrome.tabs.query:', first.id);
      return first.id;
    }
    console.warn('[start-session-form] chrome.tabs.query returned no matching normal tab');
    return null;
  } catch (cause) {
    console.warn('[start-session-form] chrome.tabs.query failed:', cause);
    return null;
  }
};

export type Props = Readonly<{
  client: BackgroundClient;
  onStarted?: (result: StartSourceSessionResult, input: StartSourceSessionInput) => void;
  resolveActiveTabId?: ActiveTabResolver;
  /** 初期値。SettingsStore から取得した既定言語ペアを適用するため */
  initialSourceLanguage?: string | undefined;
  initialTargetLanguage?: string | undefined;
}>;

const DEFAULT_SOURCE_LANGUAGE = 'en-US';
const DEFAULT_TARGET_LANGUAGE = 'ja-JP';
const DEFAULT_MONITOR_PAGE_ID = 'monitor';

/**
 * IMPL-540 StartSessionForm organism。
 *
 * SourceTypeSelector + LanguagePairSelector + displayName/autoDetect の入力 +
 * Start ボタンを統合するフォーム。submit で `BackgroundClient.startSourceSession`
 * を呼び、結果を Popup 側の `onStarted` callback に渡す。
 *
 * state 管理:
 * - form state: sourceType / displayName / autoDetect / language pair
 * - command state: useBackgroundCommand で idle/pending/success/error
 */
export function StartSessionForm(props: Props) {
  const [sourceType, setSourceType] = useState<SourceType>('tab');
  const [displayName, setDisplayName] = useState('');
  const [autoDetect, setAutoDetect] = useState(false);
  const [sourceLanguage, setSourceLanguage] = useState<string>(
    props.initialSourceLanguage ?? DEFAULT_SOURCE_LANGUAGE,
  );
  const [targetLanguage, setTargetLanguage] = useState<string>(
    props.initialTargetLanguage ?? DEFAULT_TARGET_LANGUAGE,
  );

  const command = useBackgroundCommand(props.client.startSourceSession);

  const samePair = sourceLanguage === targetLanguage;
  const canSubmit =
    displayName.trim().length > 0 && !samePair && command.state.status !== 'pending';

  const resolveActiveTabId = props.resolveActiveTabId ?? defaultActiveTabResolver;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const baseInput: Omit<StartSourceSessionInput, 'overlayTarget'> = {
      sourceType,
      displayName: displayName.trim(),
      autoDetectLanguage: autoDetect,
      sourceLanguage: autoDetect ? null : sourceLanguage,
      targetLanguage,
    };
    const buildOverlayTarget = async (): Promise<StartSourceSessionInput['overlayTarget']> => {
      // tab source: 現在 active な tab を capture + overlay 先に使う。
      // id 解決失敗時は monitor fallback (現状 tab capture は動かないが、
      // 少なくとも UseCase の validation で `sourceType='tab'` 時に
      // captureTabId 必須ロジックが入るまでの fail-soft)。
      if (sourceType === 'tab') {
        const tabId = await resolveActiveTabId();
        if (typeof tabId === 'number') {
          return { kind: 'tab', tabId };
        }
        console.warn(
          '[start-session-form] active tab id unresolved; falling back to extension-monitor',
        );
      }
      return { kind: 'extension-monitor', pageId: DEFAULT_MONITOR_PAGE_ID };
    };
    void (async () => {
      const overlayTarget = await buildOverlayTarget();
      const input: StartSourceSessionInput = { ...baseInput, overlayTarget };
      const response = await command.execute(input);
      if (response.ok && props.onStarted !== undefined) {
        props.onStarted(response.value, input);
      }
    })();
  };

  return (
    <form className="form" onSubmit={handleSubmit}>
      <div className="field">
        <Label>ソース種別</Label>
        <SourceTypeSelector
          value={sourceType}
          onChange={setSourceType}
          disabled={command.state.status === 'pending'}
        />
      </div>

      <div className="field">
        <Label htmlFor="display-name">表示名</Label>
        <TextInput
          id="display-name"
          ariaLabel="表示名"
          value={displayName}
          onChange={setDisplayName}
          placeholder="例: YouTube Live"
          disabled={command.state.status === 'pending'}
          maxLength={64}
        />
      </div>

      <LanguagePairSelector
        sourceLanguage={sourceLanguage}
        targetLanguage={targetLanguage}
        onChange={(pair) => {
          setSourceLanguage(pair.sourceLanguage);
          setTargetLanguage(pair.targetLanguage);
        }}
        disabled={command.state.status === 'pending' || autoDetect}
      />

      <div className="field">
        <Label htmlFor="auto-detect">
          <Checkbox
            id="auto-detect"
            ariaLabel="入力言語を自動判定"
            checked={autoDetect}
            onChange={setAutoDetect}
            disabled={command.state.status === 'pending'}
          />
          入力言語を自動判定する
        </Label>
      </div>

      {samePair ? (
        <p className="message" role="alert">
          入力言語と翻訳先言語は異なるものを選んでください。
        </p>
      ) : null}

      {command.state.status === 'error' ? (
        <p className="message" role="alert">
          {command.state.error.message}
        </p>
      ) : null}

      {command.state.status === 'success' ? (
        <p className="message" data-variant="success">
          セッションを開始しました。
        </p>
      ) : null}

      <Button type="submit" disabled={!canSubmit}>
        {command.state.status === 'pending' ? '開始中…' : '開始'}
      </Button>
    </form>
  );
}
