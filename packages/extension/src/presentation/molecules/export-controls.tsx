import { useState } from 'react';
import { type ExportSessionResultInput } from '../../application/dto/export-session-result-dto';
import { Button } from '../atoms/button';
import { Checkbox } from '../atoms/checkbox';
import { Label } from '../atoms/label';
import { Select, type SelectOption } from '../atoms/select';

const FORMAT_OPTIONS: readonly SelectOption[] = [
  { value: 'txt', label: 'テキスト (.txt)' },
  { value: 'json', label: 'JSON (.json)' },
];

export type ExportControlsStatus =
  | Readonly<{ kind: 'idle' }>
  | Readonly<{ kind: 'pending' }>
  | Readonly<{ kind: 'success'; bytes: number }>
  | Readonly<{ kind: 'error'; message: string }>;

export type Props = Readonly<{
  sessionId: string;
  status: ExportControlsStatus;
  onExport: (input: ExportSessionResultInput) => void;
  disabled?: boolean;
}>;

/**
 * IMPL-533 ExportControls molecule。
 *
 * エクスポート形式 (txt/json) + 原文/翻訳を含めるチェックボックス +
 * Export ボタンをまとめた UI。`onExport` は組み立てた `ExportSessionResultInput`
 * を返し、実際の dispatch と結果表示 (bytes / error) は caller の status prop
 * 経由で反映する。
 *
 * 不変条件 (domain `ExportRecord` DD-273 準拠): `includeOriginal` と
 * `includeTranslation` の少なくとも一方は true。両方 false の場合は submit を
 * 無効化して UI 層で validation する (Background まで飛ばさない)。
 */
export function ExportControls(props: Props) {
  const [format, setFormat] = useState<'txt' | 'json'>('txt');
  const [includeOriginal, setIncludeOriginal] = useState(true);
  const [includeTranslation, setIncludeTranslation] = useState(true);

  const canSubmit =
    (includeOriginal || includeTranslation) &&
    props.disabled !== true &&
    props.status.kind !== 'pending';

  return (
    <div className="exporter">
      <div className="field">
        <Label htmlFor={`export-format-${props.sessionId}`}>形式</Label>
        <Select
          id={`export-format-${props.sessionId}`}
          ariaLabel="エクスポート形式"
          value={format}
          options={FORMAT_OPTIONS}
          disabled={props.status.kind === 'pending'}
          onChange={(value) => {
            if (value === 'txt' || value === 'json') setFormat(value);
          }}
        />
      </div>
      <div className="field">
        <Label htmlFor={`export-include-original-${props.sessionId}`}>
          <Checkbox
            id={`export-include-original-${props.sessionId}`}
            ariaLabel="原文を含める"
            checked={includeOriginal}
            onChange={setIncludeOriginal}
            disabled={props.status.kind === 'pending'}
          />
          原文を含める
        </Label>
      </div>
      <div className="field">
        <Label htmlFor={`export-include-translation-${props.sessionId}`}>
          <Checkbox
            id={`export-include-translation-${props.sessionId}`}
            ariaLabel="翻訳を含める"
            checked={includeTranslation}
            onChange={setIncludeTranslation}
            disabled={props.status.kind === 'pending'}
          />
          翻訳を含める
        </Label>
      </div>
      {!includeOriginal && !includeTranslation ? (
        <p className="message" role="alert">
          少なくともどちらか一方を選択してください。
        </p>
      ) : null}
      {props.status.kind === 'error' ? (
        <p className="message" role="alert">
          {props.status.message}
        </p>
      ) : null}
      {props.status.kind === 'success' ? (
        <p className="message" data-variant="success">
          {props.status.bytes} バイトを出力しました。
        </p>
      ) : null}
      <Button
        variant="secondary"
        disabled={!canSubmit}
        ariaLabel="エクスポートを実行"
        onClick={() => {
          props.onExport({
            sessionId: props.sessionId,
            format,
            includeOriginal,
            includeTranslation,
          });
        }}
      >
        {props.status.kind === 'pending' ? '出力中…' : 'エクスポート'}
      </Button>
    </div>
  );
}
