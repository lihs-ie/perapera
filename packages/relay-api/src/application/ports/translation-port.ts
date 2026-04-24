import { type ResultAsync } from 'neverthrow';
import { type DomainError } from '../../domain/shared/errors';

/**
 * 翻訳に添える直前の確定字幕 (DD-237, REQ-NF-019)。
 *
 * `translatedText` は LLM 系プロバイダが system prompt に挿入する際に、
 * `includeTranslatedText=false` の設定なら省略する (未完翻訳の文脈は逆効果に
 * なりうるため)。NMT 系プロバイダ (DeepL / Google) は context を無視する。
 */
export type PrecedingContext = Readonly<{
  segmentId: string;
  sourceText: string;
  translatedText?: string | undefined;
  finalizedAt: string;
}>;

/**
 * 翻訳に適用する glossary エントリ (DD-238, Issue #123)。
 *
 * LLM 系プロバイダは system prompt に挿入し訳出でのマッピング遵守を促す。
 * Relay 側の後処理 (`applyGlossaryPostProcess`) で translation 出力に対して
 * 置換を強制するため、LLM が無視しても訳語を担保できる。NMT 系は native の
 * glossary API があれば尊重、無ければ後処理置換のみを適用する。
 */
export type GlossaryEntry = Readonly<{
  source: string;
  target: string;
  caseSensitive: boolean;
}>;

export type TranslationRequest = Readonly<{
  text: string;
  sourceLanguage: string | null;
  targetLanguage: string;
  /** IMPL-448: 翻訳に渡す直前確定字幕 (最大 5)。空配列可 */
  precedingContext?: readonly PrecedingContext[];
  /** Issue #123: カスタム用語集エントリ。空配列で未指定を表す */
  glossary?: readonly GlossaryEntry[];
}>;

export type TranslationResponse = Readonly<{
  text: string;
  /** プロバイダが検知した言語 (自動判定時)。判定できなければ null */
  detectedSourceLanguage: string | null;
  /** 翻訳 API 呼び出しから応答までの経過ミリ秒 (SLO 監視に利用) */
  latencyMs: number;
  /** IMPL-448: 翻訳に実際に利用された context の segmentId (NMT 等で無視した場合は空配列) */
  contextSegmentIds?: readonly string[];
}>;

/**
 * 翻訳プロバイダポート (DD-403)。
 *
 * 1 字幕 (transcript.final) につき 1 回呼び出される。タイムアウト (800ms)・
 * リトライ (1 回)・サーキットブレーカーは infrastructure 層で wrapper する。
 *
 * `precedingContext` (IMPL-448) は LLM 系プロバイダが system prompt に挿入し、
 * NMT 系は無視する。未対応プロバイダでも接続を止めず、応答の
 * `contextSegmentIds` は空配列で返すことで文脈を使わなかったことを表明する。
 */
export type TranslationPort = Readonly<{
  translate: (request: TranslationRequest) => ResultAsync<TranslationResponse, DomainError>;
}>;
