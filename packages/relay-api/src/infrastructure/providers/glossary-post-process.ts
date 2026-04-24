import { type GlossaryEntry } from '../../application/ports/translation-port';

/**
 * Glossary 後処理置換 (Issue #123)。
 *
 * 翻訳出力テキストに対し、glossary.entries を順に適用して強制置換する。
 * LLM が system prompt の指示を無視した場合や NMT で glossary 未対応の
 * 場合に、訳語の一貫性を担保する安全網として機能する。
 *
 * 規則:
 * - ASCII-only source: `\b source \b` の単語境界付きで置換 (部分一致を防ぐ)
 * - 非 ASCII source (日本語等): plain substring 置換 (単語境界を扱えないため)
 * - `caseSensitive=false`: 大文字小文字を区別しない置換
 * - regex 特殊文字は source / target で適切にエスケープ
 * - entries は渡された順で順次適用する
 */

const REGEX_SPECIAL_CHARS = /[.*+?^${}()|[\]\\]/g;

const escapeRegex = (value: string): string => value.replace(REGEX_SPECIAL_CHARS, '\\$&');

const escapeReplacement = (value: string): string => value.replace(/\$/g, '$$$$');

const isAsciiWordChar = (char: string): boolean => /^[A-Za-z0-9_]$/.test(char);

/**
 * 単語境界アサーションを source の先頭・末尾に付けるかを判定。
 *
 * `\b` は「word char (`[A-Za-z0-9_]`) と非 word char の境界」を表すため、
 * 先頭や末尾が非 word char の source (例: `C++`、`.NET`) では境界が消えて
 * マッチしなくなる。また、全て非 ASCII の source (例: `機械学習`) も日本語に
 * word boundary 概念がないため `\b` を付けない。
 */
const wrapWithBoundaries = (escapedSource: string, rawSource: string): string => {
  const first = rawSource[0];
  const last = rawSource[rawSource.length - 1];
  const prefix = first !== undefined && isAsciiWordChar(first) ? '\\b' : '';
  const suffix = last !== undefined && isAsciiWordChar(last) ? '\\b' : '';
  return `${prefix}${escapedSource}${suffix}`;
};

const applyEntry = (text: string, entry: GlossaryEntry): string => {
  if (text.length === 0 || entry.source.length === 0) return text;
  const flags = entry.caseSensitive ? 'g' : 'gi';
  const escapedSource = escapeRegex(entry.source);
  const pattern = new RegExp(wrapWithBoundaries(escapedSource, entry.source), flags);
  return text.replace(pattern, escapeReplacement(entry.target));
};

export const applyGlossaryPostProcess = (
  text: string,
  entries: readonly GlossaryEntry[],
): string => {
  if (entries.length === 0) return text;
  return entries.reduce<string>((acc, entry) => applyEntry(acc, entry), text);
};
