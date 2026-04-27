import { type FormEvent, useState } from 'react';
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
  initialSourceLanguage?: string | undefined;
  initialTargetLanguage?: string | undefined;
}>;

const DEFAULT_SOURCE_LANGUAGE = 'en-US';
const DEFAULT_TARGET_LANGUAGE = 'ja-JP';
const DEFAULT_MONITOR_PAGE_ID = 'monitor';

/**
 * StartSessionForm organism (perapera-scenes.jsx StartSessionForm 移植)。
 *
 * SourceTypeSelector + 表示名 + LanguagePairSelector + 自動判定 Checkbox +
 * Start ボタンを縦に並べる。outer は flex column padding 20×18 gap 16。
 * Start ボタンは accent + glow shadow (Button variant=primary)。
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
  const isPending = command.state.status === 'pending';

  const samePair = sourceLanguage === targetLanguage;
  const canSubmit = displayName.trim().length > 0 && !samePair && !isPending;

  const resolveActiveTabId = props.resolveActiveTabId ?? defaultActiveTabResolver;

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const baseInput: Omit<StartSourceSessionInput, 'overlayTarget'> = {
      sourceType,
      displayName: displayName.trim(),
      autoDetectLanguage: autoDetect,
      sourceLanguage: autoDetect ? null : sourceLanguage,
      targetLanguage,
    };
    const buildOverlayTarget = async (): Promise<StartSourceSessionInput['overlayTarget']> => {
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
    <form
      className="container"
      data-component="start-session-form"
      onSubmit={handleSubmit}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        padding: '20px 18px',
        flex: 1,
        overflow: 'auto',
      }}
    >
      <div>
        <Label variant="field">ソース種別</Label>
        <SourceTypeSelector value={sourceType} onChange={setSourceType} disabled={isPending} />
      </div>

      <div>
        <Label variant="field" htmlFor="display-name">
          表示名
        </Label>
        <TextInput
          id="display-name"
          ariaLabel="表示名"
          value={displayName}
          onChange={setDisplayName}
          placeholder="例: YouTube Live"
          disabled={isPending}
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
        disabled={isPending || autoDetect}
      />

      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <Checkbox
          ariaLabel="入力言語を自動判定"
          checked={autoDetect}
          onChange={setAutoDetect}
          disabled={isPending}
        />
        <span style={{ fontSize: 12.5, color: 'var(--pp-text-primary)' }}>
          入力言語を自動判定する
        </span>
      </label>

      {samePair ? (
        <p
          role="alert"
          style={{
            margin: 0,
            fontSize: 11.5,
            color: 'var(--pp-warn)',
            background: 'var(--pp-warn-soft)',
            padding: '8px 12px',
            borderRadius: 6,
            border: '1px solid rgba(245,158,11,0.25)',
          }}
        >
          入力言語と翻訳先言語は異なるものを選んでください。
        </p>
      ) : null}

      {command.state.status === 'error' ? (
        <p
          role="alert"
          style={{
            margin: 0,
            fontSize: 11.5,
            color: 'var(--pp-err)',
            background: 'var(--pp-err-soft)',
            padding: '8px 12px',
            borderRadius: 6,
            border: '1px solid rgba(248,113,113,0.25)',
          }}
        >
          {command.state.error.message}
        </p>
      ) : null}

      {command.state.status === 'success' ? (
        <p
          style={{
            margin: 0,
            fontSize: 11.5,
            color: 'var(--pp-ok)',
            background: 'rgba(52,211,153,0.10)',
            padding: '8px 12px',
            borderRadius: 6,
            border: '1px solid rgba(52,211,153,0.25)',
          }}
        >
          セッションを開始しました。
        </p>
      ) : null}

      <div style={{ marginTop: 'auto' }}>
        <Button type="submit" disabled={!canSubmit} variant="primary">
          {isPending ? 'セッション開始中…' : 'セッションを開始'}
        </Button>
      </div>
    </form>
  );
}
