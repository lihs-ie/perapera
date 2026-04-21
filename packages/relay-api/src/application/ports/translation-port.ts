import { type ResultAsync } from 'neverthrow';
import { type DomainError } from '../../domain/shared/errors';

export type TranslationRequest = Readonly<{
  text: string;
  sourceLanguage: string | null;
  targetLanguage: string;
}>;

export type TranslationResponse = Readonly<{
  text: string;
  /** プロバイダが検知した言語 (自動判定時)。判定できなければ null */
  detectedSourceLanguage: string | null;
  /** 翻訳 API 呼び出しから応答までの経過ミリ秒 (SLO 監視に利用) */
  latencyMs: number;
}>;

/**
 * 翻訳プロバイダポート (DD-403)。
 *
 * 1 字幕 (transcript.final) につき 1 回呼び出される。タイムアウト (800ms)・
 * リトライ (1 回)・サーキットブレーカーは infrastructure 層で wrapper する。
 */
export type TranslationPort = Readonly<{
  translate: (request: TranslationRequest) => ResultAsync<TranslationResponse, DomainError>;
}>;
