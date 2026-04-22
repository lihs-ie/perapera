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

export type Props = Readonly<{
  client: BackgroundClient;
  onStarted?: (result: StartSourceSessionResult) => void;
}>;

const DEFAULT_SOURCE_LANGUAGE = 'en-US';
const DEFAULT_TARGET_LANGUAGE = 'ja-JP';

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
  const [sourceLanguage, setSourceLanguage] = useState<string>(DEFAULT_SOURCE_LANGUAGE);
  const [targetLanguage, setTargetLanguage] = useState<string>(DEFAULT_TARGET_LANGUAGE);

  const command = useBackgroundCommand(props.client.startSourceSession);

  const samePair = sourceLanguage === targetLanguage;
  const canSubmit =
    displayName.trim().length > 0 && !samePair && command.state.status !== 'pending';

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const input: StartSourceSessionInput = {
      sourceType,
      displayName: displayName.trim(),
      autoDetectLanguage: autoDetect,
      sourceLanguage: autoDetect ? null : sourceLanguage,
      targetLanguage,
      overlayTarget: { kind: 'extension-monitor' },
    };
    void command.execute(input).then((response) => {
      if (response.ok && props.onStarted !== undefined) {
        props.onStarted(response.value);
      }
    });
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
