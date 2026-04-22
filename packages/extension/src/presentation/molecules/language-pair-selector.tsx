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
 * IMPL-531 LanguagePairSelector molecule。
 *
 * source / target の 2 つの Select を並べる。片方を変えると `onChange` で
 * ペア全体を返す (caller 側で language-pair の同一判定を行う)。
 */
export function LanguagePairSelector(props: Props) {
  return (
    <div className="selector">
      <div className="field">
        <Label htmlFor="source-language">入力言語</Label>
        <Select
          id="source-language"
          ariaLabel="入力言語"
          value={props.sourceLanguage}
          options={LANGUAGE_OPTIONS}
          disabled={props.disabled === true}
          onChange={(value) => {
            props.onChange({ sourceLanguage: value, targetLanguage: props.targetLanguage });
          }}
        />
      </div>
      <div className="field">
        <Label htmlFor="target-language">翻訳先言語</Label>
        <Select
          id="target-language"
          ariaLabel="翻訳先言語"
          value={props.targetLanguage}
          options={LANGUAGE_OPTIONS}
          disabled={props.disabled === true}
          onChange={(value) => {
            props.onChange({ sourceLanguage: props.sourceLanguage, targetLanguage: value });
          }}
        />
      </div>
    </div>
  );
}
