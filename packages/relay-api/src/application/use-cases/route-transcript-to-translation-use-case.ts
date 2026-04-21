import { type ResultAsync } from 'neverthrow';
import { type DomainError } from '../../domain/shared/errors';
import { type TranslationPort } from '../ports/translation-port';

/**
 * IMPL-403 RouteTranscriptToTranslationUseCase。
 *
 * 確定字幕 (`transcript.final`) が Relay に到達した際に呼び出される coordinator。
 * `TranslationPort.translate` に投げて翻訳結果を得る。タイムアウト / リトライ /
 * サーキットブレーカーは infrastructure 層の wrap で実現する (IMPL-446)。
 *
 * 本 UseCase は薄い delegate。WebSocket への emission (`translation.final` 送信)
 * は呼び出し側 (relay-route) が result.isOk() 時に行う。
 */
export type RouteTranscriptToTranslationInput = Readonly<{
  text: string;
  sourceLanguage: string | null;
  targetLanguage: string;
}>;

export type RouteTranscriptToTranslationOutput = Readonly<{
  text: string;
  detectedSourceLanguage: string | null;
  latencyMs: number;
}>;

export type RouteTranscriptToTranslationUseCase = (
  input: RouteTranscriptToTranslationInput,
) => ResultAsync<RouteTranscriptToTranslationOutput, DomainError>;

export type RouteTranscriptToTranslationDependencies = Readonly<{
  translationPort: TranslationPort;
}>;

export const createRouteTranscriptToTranslationUseCase =
  (deps: RouteTranscriptToTranslationDependencies): RouteTranscriptToTranslationUseCase =>
  (input) =>
    deps.translationPort.translate(input).map((response) => ({
      text: response.text,
      detectedSourceLanguage: response.detectedSourceLanguage,
      latencyMs: response.latencyMs,
    }));
