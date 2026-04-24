/**
 * 用語集整合性仕様 (DD-238)。
 *
 * 生成時のバリデーションは `glossary.ts` の Zod schema が権威であり、
 * 本 spec は UI preview や入力途中の差分検証で利用する軽量述語を提供する。
 *
 * 同期は `glossary-specification.test.ts` の consistency テストで保証する。
 */

import { GLOSSARY_ENTRY_FIELD_MAX_LENGTH, GLOSSARY_MAX_ENTRIES } from './glossary';

export const isValidGlossaryField = (value: unknown): boolean =>
  typeof value === 'string' && value.length >= 1 && value.length <= GLOSSARY_ENTRY_FIELD_MAX_LENGTH;

export const isValidGlossaryEntryCount = (value: unknown): boolean =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= 0 &&
  value <= GLOSSARY_MAX_ENTRIES;

export const hasUniqueSources = (entries: readonly { source: string }[]): boolean => {
  const sources = entries.map((entry) => entry.source);
  return new Set(sources).size === sources.length;
};
