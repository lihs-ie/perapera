import { Checkbox } from '../atoms/checkbox';
import { Label } from '../atoms/label';

/**
 * positionPreset は含まない編集可能フィールド。main window は overlay を
 * 自身に一元表示するため位置プリセットは UI に出さない (既存値を維持して保存)。
 */
export type OverlaySettingsFormValues = Readonly<{
  opacity: number;
  maxLines: number;
  fontScale: number;
  showOriginalText: boolean;
  showTranslatedText: boolean;
}>;

export type Props = Readonly<{
  values: OverlaySettingsFormValues;
  onChange: (next: OverlaySettingsFormValues) => void;
  disabled?: boolean;
}>;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

/**
 * OverlaySettingsForm molecule。
 *
 * 既定オーバーレイ設定の編集 UI。opacity (0-1 slider)、maxLines (1-10)、
 * fontScale (0.75-2.0)、showOriginalText / showTranslatedText のチェックを持つ。
 * 親 (`SettingsView`) が値を保持し、各変更で `onChange` が呼ばれる。
 *
 * `showOriginalText` と `showTranslatedText` が両方 false になると
 * OverlaySettings の不変条件に違反する。本 molecule では両方 false への遷移を
 * 防ぐため、片方を off にしようとしてもう片方が既に off なら変更を無視する。
 */
export function OverlaySettingsForm(props: Props) {
  const disabled = props.disabled === true;

  const updateField = <K extends keyof OverlaySettingsFormValues>(
    key: K,
    value: OverlaySettingsFormValues[K],
  ): void => {
    props.onChange({ ...props.values, [key]: value });
  };

  return (
    <div className="form" aria-label="オーバーレイ設定">
      <div className="field">
        <Label htmlFor="overlay-opacity">
          透明度 ({Math.round(props.values.opacity * 100).toString()}%)
        </Label>
        <input
          id="overlay-opacity"
          className="slider"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={props.values.opacity}
          disabled={disabled}
          onChange={(event) => {
            const next = clamp(Number.parseFloat(event.target.value), 0, 1);
            updateField('opacity', next);
          }}
        />
      </div>

      <div className="field">
        <Label htmlFor="overlay-max-lines">最大行数</Label>
        <input
          id="overlay-max-lines"
          className="input"
          type="number"
          min={1}
          max={10}
          step={1}
          value={props.values.maxLines}
          disabled={disabled}
          onChange={(event) => {
            const next = clamp(Number.parseInt(event.target.value, 10) || 1, 1, 10);
            updateField('maxLines', next);
          }}
        />
      </div>

      <div className="field">
        <Label htmlFor="overlay-font-scale">
          フォント倍率 ({props.values.fontScale.toFixed(2)}×)
        </Label>
        <input
          id="overlay-font-scale"
          className="slider"
          type="range"
          min={0.75}
          max={2}
          step={0.05}
          value={props.values.fontScale}
          disabled={disabled}
          onChange={(event) => {
            const next = clamp(Number.parseFloat(event.target.value), 0.75, 2);
            updateField('fontScale', next);
          }}
        />
      </div>

      <div className="field">
        <Label htmlFor="overlay-show-original">
          <Checkbox
            id="overlay-show-original"
            ariaLabel="原文を表示する"
            checked={props.values.showOriginalText}
            disabled={disabled}
            onChange={(checked) => {
              if (!checked && !props.values.showTranslatedText) {
                // 両方 off に遷移しようとしている — 不変条件で不可
                return;
              }
              updateField('showOriginalText', checked);
            }}
          />
          原文を表示する
        </Label>
      </div>

      <div className="field">
        <Label htmlFor="overlay-show-translation">
          <Checkbox
            id="overlay-show-translation"
            ariaLabel="翻訳を表示する"
            checked={props.values.showTranslatedText}
            disabled={disabled}
            onChange={(checked) => {
              if (!checked && !props.values.showOriginalText) {
                return;
              }
              updateField('showTranslatedText', checked);
            }}
          />
          翻訳を表示する
        </Label>
      </div>
    </div>
  );
}
