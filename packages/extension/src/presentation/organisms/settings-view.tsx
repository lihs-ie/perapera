import { useCallback, useEffect, useState } from 'react';
import { Button } from '../atoms/button';
import { Label } from '../atoms/label';
import { TextInput } from '../atoms/text-input';
import { useBackgroundCommand } from '../hooks/use-background-command';
import { useBackgroundQuery } from '../hooks/use-background-query';
import {
  type BackgroundClient,
  type DefaultLanguagePairInput,
  type DefaultOverlaySettingsInput,
  type DefaultSettingsResult,
  type RelayConnectionOverrideInput,
} from '../infrastructure/background-client';
import { LanguagePairSelector } from '../molecules/language-pair-selector';
import {
  OverlaySettingsForm,
  type OverlaySettingsFormValues,
} from '../molecules/overlay-settings-form';

export type Props = Readonly<{
  client: BackgroundClient;
  onClose: () => void;
}>;

const DEFAULT_LANGUAGE_PAIR: DefaultLanguagePairInput = { source: 'en-US', target: 'ja-JP' };
const DEFAULT_OVERLAY_FORM_VALUES: OverlaySettingsFormValues = {
  opacity: 0.8,
  maxLines: 2,
  fontScale: 1,
  showOriginalText: true,
  showTranslatedText: true,
};

const toOverlayFormValues = (
  settings: DefaultSettingsResult['overlaySettings'],
): OverlaySettingsFormValues => ({
  opacity: settings.opacity,
  maxLines: settings.maxLines,
  fontScale: settings.fontScale,
  showOriginalText: settings.showOriginalText,
  showTranslatedText: settings.showTranslatedText,
});

const isValidUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

/**
 * SettingsView organism。
 *
 * `⚙` から開く設定画面。Query で現在の default settings (言語ペア / オーバーレイ /
 * Relay override) を取得し、編集 → 保存できる。
 *
 * - **言語ペア / オーバーレイ**: 1 つの「保存」ボタンでまとめて永続化 (Reset で
 *   build-time default に戻す)
 * - **Relay 接続**: `baseUrl` / `accessToken` を atomic set する独立ボタン。
 *   rotation 用途で誤操作を避けるため言語設定と独立。「クリア」で env default
 *   に戻す
 *
 * 設定変更は以降の新規 session から反映される (既存 session には即時反映しない)。
 */
export function SettingsView(props: Props) {
  const query = useBackgroundQuery(() => props.client.getDefaultSettings(), {
    input: undefined,
  });
  const saveLanguageCommand = useBackgroundCommand(props.client.saveDefaultLanguagePair);
  const saveOverlayCommand = useBackgroundCommand(props.client.saveDefaultOverlaySettings);
  const saveRelayCommand = useBackgroundCommand(props.client.saveRelayConnectionOverride);
  const clearRelayCommand = useBackgroundCommand(() => props.client.clearRelayConnectionOverride());

  const [languagePair, setLanguagePair] = useState<DefaultLanguagePairInput>(DEFAULT_LANGUAGE_PAIR);
  const [overlayValues, setOverlayValues] = useState<OverlaySettingsFormValues>(
    DEFAULT_OVERLAY_FORM_VALUES,
  );
  const [overlayPositionPreset, setOverlayPositionPreset] =
    useState<DefaultSettingsResult['overlaySettings']['positionPreset']>('bottom');
  const [relayBaseUrl, setRelayBaseUrl] = useState<string>('');
  const [relayAccessToken, setRelayAccessToken] = useState<string>('');
  const [relayOverrideActive, setRelayOverrideActive] = useState<boolean>(false);
  const [saveResultMessage, setSaveResultMessage] = useState<string | null>(null);
  const [relayResultMessage, setRelayResultMessage] = useState<string | null>(null);

  useEffect(() => {
    if (query.state.status !== 'success' || query.state.data === null) return;
    const data = query.state.data;
    setLanguagePair(data.languagePair);
    setOverlayValues(toOverlayFormValues(data.overlaySettings));
    setOverlayPositionPreset(data.overlaySettings.positionPreset);
    if (data.relayOverride !== null) {
      setRelayBaseUrl(data.relayOverride.baseUrl);
      setRelayAccessToken(data.relayOverride.accessToken);
      setRelayOverrideActive(true);
    } else {
      setRelayBaseUrl('');
      setRelayAccessToken('');
      setRelayOverrideActive(false);
    }
  }, [query.state]);

  const handleLanguageChange = useCallback(
    (pair: { sourceLanguage: string; targetLanguage: string }) => {
      setLanguagePair({ source: pair.sourceLanguage, target: pair.targetLanguage });
    },
    [],
  );

  const handleOverlayChange = useCallback((next: OverlaySettingsFormValues) => {
    setOverlayValues(next);
  }, []);

  const isSavingDefaults =
    saveLanguageCommand.state.status === 'pending' || saveOverlayCommand.state.status === 'pending';
  const isRelayBusy =
    saveRelayCommand.state.status === 'pending' || clearRelayCommand.state.status === 'pending';
  const samePair = languagePair.source === languagePair.target;

  const handleSave = useCallback(async (): Promise<void> => {
    setSaveResultMessage(null);
    if (samePair) {
      setSaveResultMessage('入力言語と翻訳先言語は異なるものを選んでください。');
      return;
    }
    const overlayInput: DefaultOverlaySettingsInput = {
      positionPreset: overlayPositionPreset,
      ...overlayValues,
    };
    const [languageResponse, overlayResponse] = await Promise.all([
      saveLanguageCommand.execute(languagePair),
      saveOverlayCommand.execute(overlayInput),
    ]);
    if (languageResponse.ok && overlayResponse.ok) {
      setSaveResultMessage('設定を保存しました。');
    } else {
      const languageError = languageResponse.ok ? null : languageResponse.error.message;
      const overlayError = overlayResponse.ok ? null : overlayResponse.error.message;
      setSaveResultMessage(
        ['保存に失敗しました:', languageError, overlayError]
          .filter((line) => line !== null)
          .join(' / '),
      );
    }
  }, [
    languagePair,
    overlayPositionPreset,
    overlayValues,
    samePair,
    saveLanguageCommand,
    saveOverlayCommand,
  ]);

  const handleReset = useCallback(() => {
    setLanguagePair(DEFAULT_LANGUAGE_PAIR);
    setOverlayValues(DEFAULT_OVERLAY_FORM_VALUES);
    setOverlayPositionPreset('bottom');
    setSaveResultMessage('既定値に戻しました。保存ボタンで確定します。');
  }, []);

  const relayFormInvalid = !isValidUrl(relayBaseUrl) || relayAccessToken.length < 16;

  const handleSaveRelay = useCallback(async (): Promise<void> => {
    setRelayResultMessage(null);
    if (relayFormInvalid) {
      setRelayResultMessage(
        'baseUrl は http(s):// の URL、accessToken は 16 文字以上を入力してください。',
      );
      return;
    }
    const input: RelayConnectionOverrideInput = {
      baseUrl: relayBaseUrl,
      accessToken: relayAccessToken,
    };
    const response = await saveRelayCommand.execute(input);
    if (response.ok) {
      setRelayOverrideActive(true);
      setRelayResultMessage('Relay 接続情報を保存しました。');
    } else {
      setRelayResultMessage(`保存に失敗しました: ${response.error.message}`);
    }
  }, [relayFormInvalid, relayBaseUrl, relayAccessToken, saveRelayCommand]);

  const handleClearRelay = useCallback(async (): Promise<void> => {
    setRelayResultMessage(null);
    const response = await clearRelayCommand.execute(undefined);
    if (response.ok) {
      setRelayBaseUrl('');
      setRelayAccessToken('');
      setRelayOverrideActive(false);
      setRelayResultMessage('build-time default に戻しました。');
    } else {
      setRelayResultMessage(`クリアに失敗しました: ${response.error.message}`);
    }
  }, [clearRelayCommand]);

  if (query.state.status === 'idle' || query.state.status === 'pending') {
    return (
      <div className="container" role="dialog" aria-label="設定">
        <header className="header">
          <h2 className="title">設定</h2>
          <Button variant="secondary" onClick={props.onClose}>
            閉じる
          </Button>
        </header>
        <div className="body">
          <p className="message">読み込み中…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container" role="dialog" aria-label="設定">
      <header className="header">
        <h2 className="title">設定</h2>
        <Button variant="secondary" disabled={isSavingDefaults} onClick={props.onClose}>
          閉じる
        </Button>
      </header>
      <div className="body">
        <section className="section" aria-label="既定言語ペア">
          <h3 className="subtitle">既定言語ペア</h3>
          <LanguagePairSelector
            sourceLanguage={languagePair.source}
            targetLanguage={languagePair.target}
            onChange={handleLanguageChange}
            disabled={isSavingDefaults}
          />
          {samePair ? (
            <p className="message" role="alert">
              入力言語と翻訳先言語は異なるものを選んでください。
            </p>
          ) : null}
        </section>

        <section className="section" aria-label="オーバーレイ表示設定">
          <h3 className="subtitle">オーバーレイ表示</h3>
          <OverlaySettingsForm
            values={overlayValues}
            onChange={handleOverlayChange}
            disabled={isSavingDefaults}
          />
        </section>

        {saveResultMessage !== null ? (
          <p className="message" role="status">
            {saveResultMessage}
          </p>
        ) : null}

        <div className="actions">
          <Button variant="secondary" disabled={isSavingDefaults} onClick={handleReset}>
            既定値に戻す
          </Button>
          <Button
            variant="primary"
            disabled={isSavingDefaults || samePair}
            onClick={() => {
              void handleSave();
            }}
          >
            {isSavingDefaults ? '保存中…' : '保存'}
          </Button>
        </div>

        <section className="section" aria-label="Relay 接続">
          <h3 className="subtitle">
            Relay 接続
            <span
              className="badge"
              data-variant={relayOverrideActive ? 'active' : 'neutral'}
              data-testid="relay-override-badge"
            >
              {relayOverrideActive ? 'user override' : 'build-time default'}
            </span>
          </h3>
          <div className="field">
            <Label htmlFor="relay-base-url">baseUrl</Label>
            <TextInput
              id="relay-base-url"
              ariaLabel="Relay baseUrl"
              value={relayBaseUrl}
              onChange={setRelayBaseUrl}
              placeholder="http://localhost:3001"
              disabled={isRelayBusy}
            />
          </div>
          <div className="field">
            <Label htmlFor="relay-access-token">accessToken</Label>
            <TextInput
              id="relay-access-token"
              ariaLabel="Relay accessToken"
              value={relayAccessToken}
              onChange={setRelayAccessToken}
              placeholder="16 文字以上"
              disabled={isRelayBusy}
              type="password"
            />
          </div>

          {relayResultMessage !== null ? (
            <p className="message" role="status">
              {relayResultMessage}
            </p>
          ) : null}

          <div className="actions">
            <Button
              variant="secondary"
              disabled={isRelayBusy || !relayOverrideActive}
              onClick={() => {
                void handleClearRelay();
              }}
            >
              {clearRelayCommand.state.status === 'pending' ? 'クリア中…' : 'クリア'}
            </Button>
            <Button
              variant="primary"
              disabled={isRelayBusy || relayFormInvalid}
              onClick={() => {
                void handleSaveRelay();
              }}
            >
              {saveRelayCommand.state.status === 'pending' ? '保存中…' : '保存'}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
