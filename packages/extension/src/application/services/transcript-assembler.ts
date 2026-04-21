import { type Result } from 'neverthrow';
import { type DomainError } from '../../domain/shared/errors';
import { type TimestampRange } from '../../domain/transcript/timestamp-range';
import {
  appendPartialTranscriptSegment,
  attachTranslationToSegment,
  finalizeSegment,
  type TranscriptStream,
} from '../../domain/transcript/transcript-stream';

/**
 * TranscriptAssembler が処理する `TranscriptEvent` discriminated union。
 * Relay API から受信した字幕 / 翻訳イベント (api-specification §6.3) を
 * application 層の形式に正規化したもの。
 */
export type TranscriptAssemblerEvent =
  | Readonly<{
      type: 'partial';
      segmentIdentifier: string;
      revision: number;
      text: string;
      timeRange: TimestampRange;
    }>
  | Readonly<{
      type: 'final';
      segmentIdentifier: string;
      text?: string;
      timeRange?: TimestampRange;
    }>
  | Readonly<{
      type: 'translation';
      translationIdentifier: string;
      segmentIdentifier: string;
      targetLanguage: string;
      text: string;
    }>;

/**
 * IMPL-343 TranscriptAssembler (detailed-design §2.2)。
 *
 * Relay からの字幕 / 翻訳イベントを `TranscriptStream` 集約の immutable 更新に
 * 適用する薄い coordinator。ドメインの集約操作関数
 * (`appendPartialTranscriptSegment` / `finalizeSegment` /
 * `attachTranslationToSegment`) を event.type で分岐して呼び分けるのみ。
 *
 * 純粋関数なので DI なし。複数 session 間で共有しても副作用なし。
 */
export type TranscriptAssembler = Readonly<{
  apply: (
    stream: TranscriptStream,
    event: TranscriptAssemblerEvent,
  ) => Result<TranscriptStream, DomainError>;
}>;

export const createTranscriptAssembler = (): TranscriptAssembler => ({
  apply: (stream, event) => {
    switch (event.type) {
      case 'partial':
        return appendPartialTranscriptSegment(stream, {
          segmentIdentifier: event.segmentIdentifier,
          revision: event.revision,
          text: event.text,
          timeRange: event.timeRange,
        });
      case 'final': {
        const params: Parameters<typeof finalizeSegment>[1] = {
          segmentIdentifier: event.segmentIdentifier,
        };
        if (event.text !== undefined) params.text = event.text;
        if (event.timeRange !== undefined) params.timeRange = event.timeRange;
        return finalizeSegment(stream, params);
      }
      case 'translation':
        return attachTranslationToSegment(stream, {
          translationIdentifier: event.translationIdentifier,
          segmentIdentifier: event.segmentIdentifier,
          targetLanguage: event.targetLanguage,
          text: event.text,
        });
    }
  },
});
