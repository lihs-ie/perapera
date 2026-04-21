import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import { type DomainError, validationError } from '../../domain/shared/errors';
import { type OverlayRenderModel } from '../ports/overlay-presenter';

/**
 * 部分字幕処理入力 DTO (DTO-I-304, DD-304)。
 *
 * Relay イベント `transcript.partial` 受信時に UseCase 層が受け取る境界型。
 * `revision >= 1` (整数)、`text.length >= 1`、`timeRange.startMs <= endMs`
 * を検証。文字列上限はドメイン側の TranscriptSegment バリデーションで再確認
 * される。
 */
export type HandleTranscriptPartialInput = {
  sessionId: string;
  segmentId: string;
  revision: number;
  text: string;
  timeRange: {
    startMs: number;
    endMs: number;
  };
};

const timeRangeSchema = z
  .object({
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().nonnegative(),
  })
  .refine((value) => value.startMs <= value.endMs, {
    message: 'startMs must be <= endMs',
  });

const handleTranscriptPartialInputSchema = z.object({
  sessionId: z.string().min(1),
  segmentId: z.string().min(1),
  revision: z.number().int().min(1),
  text: z.string().min(1),
  timeRange: timeRangeSchema,
});

export const parseHandleTranscriptPartialInput = (
  raw: unknown,
): Result<HandleTranscriptPartialInput, DomainError> => {
  const result = handleTranscriptPartialInputSchema.safeParse(raw);
  if (!result.success) {
    return err(
      validationError({
        field: 'HandleTranscriptPartialInput',
        message: result.error.issues.map((issue) => issue.message).join('; '),
      }),
    );
  }
  return ok(result.data);
};

/**
 * 部分字幕処理出力 DTO (DTO-O-304)。
 *
 * `TranscriptSegment` の要約と、`OverlayPresenter` へプッシュする
 * `OverlayRenderModel` を含む。UseCase 層内で `OverlayRenderModel` を
 * 構築し本 DTO に含める。
 */
export type HandleTranscriptPartialOutput = Readonly<{
  sessionId: string;
  segmentId: string;
  revision: number;
  renderModel: OverlayRenderModel;
}>;
