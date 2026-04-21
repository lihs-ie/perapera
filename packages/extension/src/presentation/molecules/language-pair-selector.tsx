import React from 'react';
import { Label } from '../atoms/label';
import { Select, type SelectOption } from '../atoms/select';

/**
 * MVP では 4 ペア程度を想定。BCP-47 BCP-47 形式の code に対して日本語ラベルを
 * 固定 map で割り当てる。設定から取得する運用は Phase 6 以降。
 */
export const LANGUAGE_OPTIONS: readonly SelectOption[] = [
  { value: 'en-US', label: '英語 (米国)' },
  { value: 'ja-JP', label: '日本語' },
  { value: 'ko-KR', label: '韓国語' },
  { value: 'zh-CN', label: '中国語 (簡体)' },
];

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
