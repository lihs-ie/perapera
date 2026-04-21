import React from 'react';
import { type SourceType, SOURCE_TYPES } from '../../domain/session/source-type';

export type Props = Readonly<{
  value: SourceType;
  onChange: (value: SourceType) => void;
  disabled?: boolean;
}>;

const LABELS: Readonly<Record<SourceType, string>> = {
  tab: 'ブラウザタブ',
  microphone: 'マイク',
  desktop: 'デスクトップ',
};

/**
 * IMPL-530 SourceTypeSelector molecule。
 *
 * tab / microphone / desktop を radio で選択する UI。各オプションは domain 側
 * `SOURCE_TYPES` と同期し、追加時は自動で UI に反映される。
 */
export function SourceTypeSelector(props: Props) {
  return (
    <div className="selector" role="radiogroup" aria-label="ソース種別">
      {SOURCE_TYPES.map((type) => (
        <label key={type} className="option">
          <input
            type="radio"
            name="source-type"
            value={type}
            checked={props.value === type}
            disabled={props.disabled === true}
            onChange={() => {
              props.onChange(type);
            }}
          />
          <span>{LABELS[type]}</span>
        </label>
      ))}
    </div>
  );
}
