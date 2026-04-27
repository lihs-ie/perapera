import { useCallback, useEffect, useState } from 'react';
import { Button } from '../atoms/button';
import { Checkbox } from '../atoms/checkbox';
import { Label } from '../atoms/label';
import { TextInput } from '../atoms/text-input';
import { useBackgroundCommand } from '../hooks/use-background-command';
import { useBackgroundQuery } from '../hooks/use-background-query';
import {
  type BackgroundClient,
  type DefaultEndpointingPolicyInput,
  type DefaultGlossaryInput,
  type DefaultLanguagePairInput,
  type DefaultOverlaySettingsInput,
  type DefaultSettingsResult,
  type DefaultTranslationContextWindowInput,
  type RelayConnectionOverrideInput,
  type SessionRetentionPolicyInput,
} from '../infrastructure/background-client';
import { GlossaryEditor, type GlossaryEntryValue } from '../molecules/glossary-editor';
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

const DEFAULT_ENDPOINTING_FORM: DefaultEndpointingPolicyInput = {
  silenceThresholdMs: 600,
  punctuationAware: true,
  minUtteranceMs: 500,
};

const DEFAULT_TRANSLATION_CONTEXT_FORM: DefaultTranslationContextWindowInput = {
  maxSegments: 3,
  includeTranslatedText: true,
};

const clampInt = (value: number, min: number, max: number): number => {
  if (Number.isNaN(value)) return min;
  const int = Math.round(value);
  if (int < min) return min;
  if (int > max) return max;
  return int;
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
  const glossaryQuery = useBackgroundQuery(() => props.client.getDefaultGlossary(), {
    input: undefined,
  });
  const retentionQuery = useBackgroundQuery(() => props.client.getSessionRetentionPolicy(), {
    input: undefined,
  });
  const saveLanguageCommand = useBackgroundCommand(props.client.saveDefaultLanguagePair);
  const saveOverlayCommand = useBackgroundCommand(props.client.saveDefaultOverlaySettings);
  const saveEndpointingCommand = useBackgroundCommand(props.client.saveDefaultEndpointingPolicy);
  const saveTranslationContextCommand = useBackgroundCommand(
    props.client.saveDefaultTranslationContextWindow,
  );
  const saveGlossaryCommand = useBackgroundCommand(props.client.saveDefaultGlossary);
  const saveRetentionCommand = useBackgroundCommand(props.client.saveSessionRetentionPolicy);
  const purgeAllCommand = useBackgroundCommand(() => props.client.purgeAllSessions());
  const saveRelayCommand = useBackgroundCommand(props.client.saveRelayConnectionOverride);
  const clearRelayCommand = useBackgroundCommand(() => props.client.clearRelayConnectionOverride());

  const [languagePair, setLanguagePair] = useState<DefaultLanguagePairInput>(DEFAULT_LANGUAGE_PAIR);
  const [overlayValues, setOverlayValues] = useState<OverlaySettingsFormValues>(
    DEFAULT_OVERLAY_FORM_VALUES,
  );
  const [overlayPositionPreset, setOverlayPositionPreset] =
    useState<DefaultSettingsResult['overlaySettings']['positionPreset']>('bottom');
  const [endpointingValues, setEndpointingValues] =
    useState<DefaultEndpointingPolicyInput>(DEFAULT_ENDPOINTING_FORM);
  const [translationContextValues, setTranslationContextValues] =
    useState<DefaultTranslationContextWindowInput>(DEFAULT_TRANSLATION_CONTEXT_FORM);
  const [advancedOpen, setAdvancedOpen] = useState<boolean>(false);
  const [relayBaseUrl, setRelayBaseUrl] = useState<string>('');
  const [relayAccessToken, setRelayAccessToken] = useState<string>('');
  const [relayOverrideActive, setRelayOverrideActive] = useState<boolean>(false);
  const [glossaryEntries, setGlossaryEntries] = useState<readonly GlossaryEntryValue[]>([]);
  const [glossaryResultMessage, setGlossaryResultMessage] = useState<string | null>(null);
  const [retentionDays, setRetentionDays] = useState<number | null>(30);
  const [retentionMaxCount, setRetentionMaxCount] = useState<number | null>(100);
  const [retentionResultMessage, setRetentionResultMessage] = useState<string | null>(null);
  const [saveResultMessage, setSaveResultMessage] = useState<string | null>(null);
  const [relayResultMessage, setRelayResultMessage] = useState<string | null>(null);

  useEffect(() => {
    if (query.state.status !== 'success' || query.state.data === null) return;
    const data = query.state.data;
    setLanguagePair(data.languagePair);
    setOverlayValues(toOverlayFormValues(data.overlaySettings));
    setOverlayPositionPreset(data.overlaySettings.positionPreset);
    setEndpointingValues({
      silenceThresholdMs: data.endpointing.silenceThresholdMs,
      punctuationAware: data.endpointing.punctuationAware,
      minUtteranceMs: data.endpointing.minUtteranceMs,
    });
    setTranslationContextValues({
      maxSegments: data.translationContext.maxSegments,
      includeTranslatedText: data.translationContext.includeTranslatedText,
    });
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

  useEffect(() => {
    if (glossaryQuery.state.status !== 'success' || glossaryQuery.state.data === null) return;
    setGlossaryEntries(glossaryQuery.state.data.entries);
  }, [glossaryQuery.state]);

  useEffect(() => {
    if (retentionQuery.state.status !== 'success' || retentionQuery.state.data === null) return;
    setRetentionDays(retentionQuery.state.data.days);
    setRetentionMaxCount(retentionQuery.state.data.maxCount);
  }, [retentionQuery.state]);

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
    saveLanguageCommand.state.status === 'pending' ||
    saveOverlayCommand.state.status === 'pending' ||
    saveEndpointingCommand.state.status === 'pending' ||
    saveTranslationContextCommand.state.status === 'pending';
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
    const [languageResponse, overlayResponse, endpointingResponse, contextResponse] =
      await Promise.all([
        saveLanguageCommand.execute(languagePair),
        saveOverlayCommand.execute(overlayInput),
        saveEndpointingCommand.execute(endpointingValues),
        saveTranslationContextCommand.execute(translationContextValues),
      ]);
    const allOk =
      languageResponse.ok && overlayResponse.ok && endpointingResponse.ok && contextResponse.ok;
    if (allOk) {
      setSaveResultMessage('設定を保存しました。');
    } else {
      const errors = [
        languageResponse.ok ? null : languageResponse.error.message,
        overlayResponse.ok ? null : overlayResponse.error.message,
        endpointingResponse.ok ? null : endpointingResponse.error.message,
        contextResponse.ok ? null : contextResponse.error.message,
      ].filter((line): line is string => line !== null);
      setSaveResultMessage(['保存に失敗しました:', ...errors].join(' / '));
    }
  }, [
    endpointingValues,
    languagePair,
    overlayPositionPreset,
    overlayValues,
    samePair,
    saveEndpointingCommand,
    saveLanguageCommand,
    saveOverlayCommand,
    saveTranslationContextCommand,
    translationContextValues,
  ]);

  const handleReset = useCallback(() => {
    setLanguagePair(DEFAULT_LANGUAGE_PAIR);
    setOverlayValues(DEFAULT_OVERLAY_FORM_VALUES);
    setOverlayPositionPreset('bottom');
    setEndpointingValues(DEFAULT_ENDPOINTING_FORM);
    setTranslationContextValues(DEFAULT_TRANSLATION_CONTEXT_FORM);
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

  const handleSaveGlossary = useCallback(async (): Promise<void> => {
    setGlossaryResultMessage(null);
    const input: DefaultGlossaryInput = {
      entries: glossaryEntries.map((entry) => ({
        source: entry.source,
        target: entry.target,
        caseSensitive: entry.caseSensitive,
      })),
    };
    const response = await saveGlossaryCommand.execute(input);
    if (response.ok) {
      setGlossaryResultMessage('用語集を保存しました。次のセッション開始から反映されます。');
    } else {
      setGlossaryResultMessage(`保存に失敗しました: ${response.error.message}`);
    }
  }, [glossaryEntries, saveGlossaryCommand]);

  const handleExportGlossaryCsv = useCallback((): void => {
    const header = 'source,target,caseSensitive';
    const escapeCsvField = (value: string): string =>
      /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
    const rows = glossaryEntries.map((entry) =>
      [
        escapeCsvField(entry.source),
        escapeCsvField(entry.target),
        entry.caseSensitive ? 'true' : 'false',
      ].join(','),
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'perapera-glossary.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }, [glossaryEntries]);

  const handleSaveRetention = useCallback(async (): Promise<void> => {
    setRetentionResultMessage(null);
    if (retentionDays === null && retentionMaxCount === null) {
      setRetentionResultMessage('保持期間と保持件数のどちらか一方は必ず設定してください。');
      return;
    }
    const input: SessionRetentionPolicyInput = {
      days: retentionDays,
      maxCount: retentionMaxCount,
    };
    const response = await saveRetentionCommand.execute(input);
    if (response.ok) {
      setRetentionResultMessage('履歴保持ポリシーを保存しました。');
    } else {
      setRetentionResultMessage(`保存に失敗しました: ${response.error.message}`);
    }
  }, [retentionDays, retentionMaxCount, saveRetentionCommand]);

  const handlePurgeAll = useCallback(async (): Promise<void> => {
    setRetentionResultMessage(null);
    const confirmed = window.confirm(
      '全てのセッション履歴を削除します。この操作は取り消せません。続行しますか？',
    );
    if (!confirmed) return;
    const response = await purgeAllCommand.execute(undefined);
    if (response.ok) {
      setRetentionResultMessage(
        `${String(response.value.totalPurged)} 件のセッションを削除しました。`,
      );
    } else {
      setRetentionResultMessage(`削除に失敗しました: ${response.error.message}`);
    }
  }, [purgeAllCommand]);

  const handleImportGlossaryCsv = useCallback(async (file: File): Promise<void> => {
    setGlossaryResultMessage(null);
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
    const header = lines[0]?.toLowerCase() ?? '';
    const body = header.startsWith('source,') ? lines.slice(1) : lines;
    const parsed: GlossaryEntryValue[] = [];
    const seenSources = new Set<string>();
    for (const line of body) {
      const parts = line.split(',');
      const source = parts[0]?.trim() ?? '';
      const target = parts[1]?.trim() ?? '';
      const caseSensitive = (parts[2]?.trim() ?? 'false').toLowerCase() === 'true';
      if (source.length === 0 || target.length === 0 || source === target) continue;
      if (seenSources.has(source)) continue;
      seenSources.add(source);
      parsed.push({ source, target, caseSensitive });
    }
    setGlossaryEntries(parsed);
    setGlossaryResultMessage(
      `CSV から ${String(parsed.length)} 件読み込みました。「保存」で確定します。`,
    );
  }, []);

  const rootStyle = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  } as const;
  if (query.state.status === 'idle' || query.state.status === 'pending') {
    return (
      <div className="container" role="dialog" aria-label="設定" style={rootStyle}>
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
    <div className="container" role="dialog" aria-label="設定" style={rootStyle}>
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

        <section className="section" aria-label="詳細 (セグメント連続性)">
          <h3 className="subtitle">
            <button
              type="button"
              className="toggle"
              aria-expanded={advancedOpen}
              onClick={() => {
                setAdvancedOpen((prev) => !prev);
              }}
            >
              詳細 (息継ぎで途切れるときに調整) {advancedOpen ? '▾' : '▸'}
            </button>
          </h3>
          {advancedOpen ? (
            <div className="advanced" data-testid="advanced-section">
              <div className="field">
                <Label htmlFor="endpointing-silence">無音での文末判定時間 (ms)</Label>
                <TextInput
                  id="endpointing-silence"
                  ariaLabel="silenceThresholdMs"
                  type="number"
                  value={String(endpointingValues.silenceThresholdMs)}
                  onChange={(next) => {
                    setEndpointingValues((prev) => ({
                      ...prev,
                      silenceThresholdMs: clampInt(Number(next), 200, 1200),
                    }));
                  }}
                  disabled={isSavingDefaults}
                />
                <p className="hint">200〜1200ms (既定 600)。長めにすると息継ぎで途切れにくい。</p>
              </div>
              <div className="field">
                <Label htmlFor="endpointing-punctuation">句読点感度</Label>
                <Checkbox
                  id="endpointing-punctuation"
                  ariaLabel="punctuationAware"
                  checked={endpointingValues.punctuationAware}
                  onChange={(checked) => {
                    setEndpointingValues((prev) => ({ ...prev, punctuationAware: checked }));
                  }}
                  disabled={isSavingDefaults}
                />
              </div>
              <div className="field">
                <Label htmlFor="endpointing-min-utterance">最小発話長 (ms)</Label>
                <TextInput
                  id="endpointing-min-utterance"
                  ariaLabel="minUtteranceMs"
                  type="number"
                  value={String(endpointingValues.minUtteranceMs)}
                  onChange={(next) => {
                    setEndpointingValues((prev) => ({
                      ...prev,
                      minUtteranceMs: clampInt(Number(next), 100, 3000),
                    }));
                  }}
                  disabled={isSavingDefaults}
                />
                <p className="hint">100〜3000ms (既定 500)。</p>
              </div>
              <div className="field">
                <Label htmlFor="translation-context-max">翻訳の文脈保持 (segment 数)</Label>
                <TextInput
                  id="translation-context-max"
                  ariaLabel="maxSegments"
                  type="number"
                  value={String(translationContextValues.maxSegments)}
                  onChange={(next) => {
                    setTranslationContextValues((prev) => ({
                      ...prev,
                      maxSegments: clampInt(Number(next), 0, 5),
                    }));
                  }}
                  disabled={isSavingDefaults}
                />
                <p className="hint">0〜5 (既定 3)。0 は文脈を渡さない従来挙動。</p>
              </div>
              <div className="field">
                <Label htmlFor="translation-context-include">訳文も文脈に含める</Label>
                <Checkbox
                  id="translation-context-include"
                  ariaLabel="includeTranslatedText"
                  checked={translationContextValues.includeTranslatedText}
                  onChange={(checked) => {
                    setTranslationContextValues((prev) => ({
                      ...prev,
                      includeTranslatedText: checked,
                    }));
                  }}
                  disabled={isSavingDefaults}
                />
              </div>
              <p className="hint">設定変更は次のセッション開始から反映されます。</p>
            </div>
          ) : null}
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

        <section className="section" aria-label="用語集">
          <h3 className="subtitle">用語集</h3>
          <p className="hint">
            原文→訳文のペアを登録すると、翻訳時に強制置換されます。変更は次のセッション開始から反映されます。
          </p>
          <GlossaryEditor
            entries={glossaryEntries}
            onChange={setGlossaryEntries}
            disabled={saveGlossaryCommand.state.status === 'pending'}
          />
          {glossaryResultMessage !== null ? (
            <p className="message" role="status">
              {glossaryResultMessage}
            </p>
          ) : null}
          <div className="actions">
            <Button
              variant="secondary"
              disabled={
                saveGlossaryCommand.state.status === 'pending' || glossaryEntries.length === 0
              }
              onClick={handleExportGlossaryCsv}
              ariaLabel="用語集を CSV でエクスポート"
            >
              CSV エクスポート
            </Button>
            <label className="import-label">
              <input
                type="file"
                accept="text/csv,.csv"
                disabled={saveGlossaryCommand.state.status === 'pending'}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file !== undefined) void handleImportGlossaryCsv(file);
                }}
                aria-label="用語集を CSV からインポート"
              />
              CSV インポート
            </label>
            <Button
              variant="primary"
              disabled={saveGlossaryCommand.state.status === 'pending'}
              onClick={() => {
                void handleSaveGlossary();
              }}
            >
              {saveGlossaryCommand.state.status === 'pending' ? '保存中…' : '保存'}
            </Button>
          </div>
        </section>

        <section className="section" aria-label="履歴保持">
          <h3 className="subtitle">履歴保持</h3>
          <p className="hint">
            セッション履歴の保持期間と件数を設定します。超過分は 24 時間ごとに自動削除されます。
            保持期間と件数のどちらか一方は必ず設定してください (プライバシー / quota 保護)。
          </p>
          <div className="field">
            <Label htmlFor="retention-days">保持期間 (日)</Label>
            <TextInput
              id="retention-days"
              ariaLabel="保持期間 (日)"
              type="number"
              value={retentionDays === null ? '' : String(retentionDays)}
              onChange={(next) => {
                const trimmed = next.trim();
                if (trimmed === '') {
                  setRetentionDays(null);
                  return;
                }
                const parsed = Number(trimmed);
                if (Number.isNaN(parsed)) return;
                setRetentionDays(clampInt(parsed, 1, 365));
              }}
              placeholder="1〜365 (空欄で無効)"
              disabled={saveRetentionCommand.state.status === 'pending'}
            />
            <p className="hint">1〜365 日 (既定 30)。空欄で保持期間の制限を無効にします。</p>
          </div>
          <div className="field">
            <Label htmlFor="retention-max-count">保持件数 (件)</Label>
            <TextInput
              id="retention-max-count"
              ariaLabel="保持件数 (件)"
              type="number"
              value={retentionMaxCount === null ? '' : String(retentionMaxCount)}
              onChange={(next) => {
                const trimmed = next.trim();
                if (trimmed === '') {
                  setRetentionMaxCount(null);
                  return;
                }
                const parsed = Number(trimmed);
                if (Number.isNaN(parsed)) return;
                setRetentionMaxCount(clampInt(parsed, 1, 10000));
              }}
              placeholder="1〜10000 (空欄で無効)"
              disabled={saveRetentionCommand.state.status === 'pending'}
            />
            <p className="hint">1〜10000 件 (既定 100)。空欄で保持件数の制限を無効にします。</p>
          </div>
          {retentionResultMessage !== null ? (
            <p className="message" role="status">
              {retentionResultMessage}
            </p>
          ) : null}
          <div className="actions">
            <Button
              variant="danger"
              disabled={
                purgeAllCommand.state.status === 'pending' ||
                saveRetentionCommand.state.status === 'pending'
              }
              onClick={() => {
                void handlePurgeAll();
              }}
            >
              {purgeAllCommand.state.status === 'pending' ? '削除中…' : '今すぐ全履歴を削除'}
            </Button>
            <Button
              variant="primary"
              disabled={
                saveRetentionCommand.state.status === 'pending' ||
                (retentionDays === null && retentionMaxCount === null)
              }
              onClick={() => {
                void handleSaveRetention();
              }}
            >
              {saveRetentionCommand.state.status === 'pending' ? '保存中…' : '保存'}
            </Button>
          </div>
        </section>

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
