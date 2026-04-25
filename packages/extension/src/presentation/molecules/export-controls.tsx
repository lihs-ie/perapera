import { useCallback, useState } from 'react';
import { Button } from '../atoms/button';
import { Checkbox } from '../atoms/checkbox';
import { Label } from '../atoms/label';
import { Select } from '../atoms/select';
import { useBackgroundCommand } from '../hooks/use-background-command';
import {
  type BackgroundClient,
  type ExportSessionResultResult,
} from '../infrastructure/background-client';

export type ExportFormat = 'txt' | 'json' | 'csv';

export type Props = Readonly<{
  client: BackgroundClient;
  sessionId: string;
  /**
   * file download を実行する関数。default は `downloadViaAnchor`
   * (`URL.createObjectURL` + `a.download`)。テストで stub に差し替えられる。
   */
  download?: (params: { filename: string; content: string; mimeType: string }) => void;
}>;

const FORMAT_OPTIONS = [
  { value: 'txt' as const, label: 'TXT' },
  { value: 'json' as const, label: 'JSON' },
  { value: 'csv' as const, label: 'CSV' },
];

const MIME_TYPE: Readonly<Record<ExportFormat, string>> = {
  txt: 'text/plain;charset=utf-8',
  json: 'application/json;charset=utf-8',
  csv: 'text/csv;charset=utf-8',
};

const downloadViaAnchor = (params: {
  filename: string;
  content: string;
  mimeType: string;
}): void => {
  const blob = new Blob([params.content], { type: params.mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = params.filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // a.click() 直後に revoke すると Firefox 等で download が cancel される
  // ことがあるため、tick 跨ぎで revoke する。
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
};

const buildFilename = (sessionId: string, format: ExportFormat): string => {
  const safe = sessionId.replace(/[^A-Za-z0-9_-]/g, '');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `perapera-${safe || 'session'}-${stamp}.${format}`;
};

/**
 * IMPL-533 (再導入) ExportControls molecule (Issue #106)。
 *
 * セッション停止後 (capturing 中も可) に、保存済 transcript / translation を
 * TXT / JSON / CSV 形式でローカルダウンロードする。`BackgroundClient.exportSessionResult`
 * の応答に含まれる整形済 `content` を `Blob` 化し、`a.download` でファイルを
 * 取得する。
 *
 * 不変条件: `includeOriginal === false && includeTranslation === false` は
 * UseCase 側で reject されるため、UI でも Export ボタンを disabled にする。
 */
export function ExportControls(props: Props) {
  const exportCommand = useBackgroundCommand(props.client.exportSessionResult);
  const [format, setFormat] = useState<ExportFormat>('txt');
  const [includeOriginal, setIncludeOriginal] = useState<boolean>(true);
  const [includeTranslation, setIncludeTranslation] = useState<boolean>(true);
  const [message, setMessage] = useState<string | null>(null);

  const isPending = exportCommand.state.status === 'pending';
  const nothingSelected = !includeOriginal && !includeTranslation;
  const download = props.download ?? downloadViaAnchor;

  const handleExport = useCallback(async (): Promise<void> => {
    setMessage(null);
    if (nothingSelected) {
      setMessage('原文または翻訳の少なくとも 1 つを選んでください。');
      return;
    }
    const response = await exportCommand.execute({
      sessionId: props.sessionId,
      format,
      includeOriginal,
      includeTranslation,
    });
    if (!response.ok) {
      setMessage(`エクスポートに失敗しました: ${response.error.message}`);
      return;
    }
    const value: ExportSessionResultResult = response.value;
    download({
      filename: buildFilename(props.sessionId, value.format),
      content: value.content,
      mimeType: MIME_TYPE[value.format],
    });
    setMessage(`保存しました (${value.bytes} bytes)`);
  }, [
    download,
    exportCommand,
    format,
    includeOriginal,
    includeTranslation,
    nothingSelected,
    props.sessionId,
  ]);

  return (
    <div className="container" data-testid="export-controls">
      <div className="field">
        <Label htmlFor="export-format">形式</Label>
        <Select
          id="export-format"
          value={format}
          ariaLabel="エクスポート形式"
          options={FORMAT_OPTIONS}
          onChange={(next) => {
            if (next === 'txt' || next === 'json' || next === 'csv') setFormat(next);
          }}
          disabled={isPending}
        />
      </div>
      <div className="field">
        <Label htmlFor="export-include-original">原文を含める</Label>
        <Checkbox
          id="export-include-original"
          ariaLabel="includeOriginal"
          checked={includeOriginal}
          onChange={setIncludeOriginal}
          disabled={isPending}
        />
      </div>
      <div className="field">
        <Label htmlFor="export-include-translation">翻訳を含める</Label>
        <Checkbox
          id="export-include-translation"
          ariaLabel="includeTranslation"
          checked={includeTranslation}
          onChange={setIncludeTranslation}
          disabled={isPending}
        />
      </div>
      <Button
        variant="secondary"
        ariaLabel="エクスポート"
        disabled={isPending || nothingSelected}
        onClick={() => {
          void handleExport();
        }}
      >
        {isPending ? 'エクスポート中…' : 'エクスポート'}
      </Button>
      {message !== null ? (
        <p className="message" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
