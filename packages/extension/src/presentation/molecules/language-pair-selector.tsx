import { ArrowIcon } from '../atoms/icons/arrow-icon';
import { Label } from '../atoms/label';
import { Select } from '../atoms/select';
import { LANGUAGE_OPTIONS } from './language-options';

export type Props = Readonly<{
  sourceLanguage: string;
  targetLanguage: string;
  onChange: (pair: { sourceLanguage: string; targetLanguage: string }) => void;
  disabled?: boolean;
}>;

/**
 * LanguagePairSelector molecule (perapera-scenes.jsx StartSessionForm 移植)。
 *
 * `gridTemplateColumns: '1fr auto 1fr'` で source/arrow/target を等幅レイアウト。
 * 中央の arrow icon は `--pp-text-dim` 色、source / target は FieldLabel +
 * Select の縦並び。
 */
export function LanguagePairSelector(props: Props) {
  const disabled = props.disabled === true;
  return (
    <div
      className="container"
      data-component="language-pair-selector"
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        gap: 8,
        alignItems: 'end',
      }}
    >
      <div>
        <Label htmlFor="source-language" variant="field">
          入力言語
        </Label>
        <Select
          id="source-language"
          ariaLabel="入力言語"
          value={props.sourceLanguage}
          options={LANGUAGE_OPTIONS}
          disabled={disabled}
          onChange={(value) => {
            props.onChange({ sourceLanguage: value, targetLanguage: props.targetLanguage });
          }}
        />
      </div>
      <div
        aria-hidden="true"
        style={{
          paddingBottom: 11,
          color: 'var(--pp-text-dim)',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <ArrowIcon size={10} />
      </div>
      <div>
        <Label htmlFor="target-language" variant="field">
          翻訳先言語
        </Label>
        <Select
          id="target-language"
          ariaLabel="翻訳先言語"
          value={props.targetLanguage}
          options={LANGUAGE_OPTIONS}
          disabled={disabled}
          onChange={(value) => {
            props.onChange({ sourceLanguage: props.sourceLanguage, targetLanguage: value });
          }}
        />
      </div>
    </div>
  );
}
