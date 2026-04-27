import { Checkbox } from '../atoms/checkbox';
import { Label } from '../atoms/label';
import { RangeSlider } from '../atoms/range-slider';

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
 * OverlaySettingsForm molecule (perapera-scenes.jsx SettingsScene 移植)。
 *
 * 透明度 / フォント倍率は RangeSlider、最大行数は number input、
 * showOriginalText / showTranslatedText は Checkbox。両方 off 遷移は
 * OverlaySettings の不変条件で禁止のため UI でも無視する。
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
    <div
      className="container"
      data-component="overlay-settings-form"
      aria-label="オーバーレイ設定"
      style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      <div data-part="field">
        <Label htmlFor="overlay-opacity">
          透明度 ({Math.round(props.values.opacity * 100).toString()}%)
        </Label>
        <RangeSlider
          id="overlay-opacity"
          ariaLabel="透明度"
          value={props.values.opacity}
          min={0}
          max={1}
          step={0.05}
          disabled={disabled}
          onChange={(next) => updateField('opacity', clamp(next, 0, 1))}
        />
      </div>

      <div data-part="field">
        <Label htmlFor="overlay-max-lines">最大行数</Label>
        <input
          id="overlay-max-lines"
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
          style={{
            width: 80,
            padding: '7px 9px',
            background: 'var(--pp-surface)',
            border: '1px solid var(--pp-border)',
            borderRadius: 6,
            color: 'var(--pp-text-primary)',
            fontFamily: 'var(--pp-font-numeric)',
            fontSize: 12.5,
            outline: 'none',
          }}
        />
      </div>

      <div data-part="field">
        <Label htmlFor="overlay-font-scale">
          フォント倍率 ({props.values.fontScale.toFixed(2)}×)
        </Label>
        <RangeSlider
          id="overlay-font-scale"
          ariaLabel="フォント倍率"
          value={props.values.fontScale}
          min={0.75}
          max={2}
          step={0.05}
          disabled={disabled}
          onChange={(next) => updateField('fontScale', clamp(next, 0.75, 2))}
        />
      </div>

      <div data-part="field" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Checkbox
          id="overlay-show-original"
          ariaLabel="原文を表示する"
          checked={props.values.showOriginalText}
          disabled={disabled}
          onChange={(checked) => {
            if (!checked && !props.values.showTranslatedText) return;
            updateField('showOriginalText', checked);
          }}
        />
        <Label htmlFor="overlay-show-original">原文を表示する</Label>
      </div>

      <div data-part="field" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Checkbox
          id="overlay-show-translation"
          ariaLabel="翻訳を表示する"
          checked={props.values.showTranslatedText}
          disabled={disabled}
          onChange={(checked) => {
            if (!checked && !props.values.showOriginalText) return;
            updateField('showTranslatedText', checked);
          }}
        />
        <Label htmlFor="overlay-show-translation">翻訳を表示する</Label>
      </div>
    </div>
  );
}
