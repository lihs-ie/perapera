import { type SelectOption } from '../atoms/select';

/**
 * LanguagePairSelector の選択肢定数 (BCP-47 code → 日本語ラベル)。
 * MVP では 4 ペア固定。将来的には chrome.storage.local から取得する運用に拡張。
 *
 * component ファイル (language-pair-selector.tsx) 外に置くのは react-refresh の
 * 「component ファイルは component のみを export」という制約を守るため。
 */
export const LANGUAGE_OPTIONS: readonly SelectOption[] = [
  { value: 'en-US', label: '英語 (米国)' },
  { value: 'ja-JP', label: '日本語' },
  { value: 'ko-KR', label: '韓国語' },
  { value: 'zh-CN', label: '中国語 (簡体)' },
];
