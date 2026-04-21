import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import { type DomainError, validationError } from '../../domain/shared/errors';
import { type OverlayPositionPreset } from '../../domain/specifications/overlay-settings-specification';

/**
 * セッション監視状態取得入力 DTO (DTO-I-302, DD-302)。
 *
 * Side Panel 等から UseCase 層へ渡される Query 入力。`sessionIds` 省略時は
 * 全アクティブセッションを返す。空配列は意図が曖昧 (絞り込み 0 件) なため
 * validation で拒否 (undefined を使う)。
 */
export type GetSessionMonitorStateInput = {
  sessionIds?: readonly string[] | undefined;
  includeOverlayState: boolean;
};

const getSessionMonitorStateInputSchema = z.object({
  sessionIds: z.array(z.string().min(1)).min(1).optional(),
  includeOverlayState: z.boolean(),
});

export const parseGetSessionMonitorStateInput = (
  raw: unknown,
): Result<GetSessionMonitorStateInput, DomainError> => {
  const result = getSessionMonitorStateInputSchema.safeParse(raw);
  if (!result.success) {
    return err(
      validationError({
        field: 'GetSessionMonitorStateInput',
        message: result.error.issues.map((issue) => issue.message).join('; '),
      }),
    );
  }
  return ok(result.data);
};

/**
 * セッション監視状態出力 DTO (DTO-O-302)。
 *
 * Side Panel / Popup UI に表示する複合構造。`SourceSession` と
 * `TranscriptStream` から投影し primitive 化する。`overlayState` は
 * `includeOverlayState === true` の場合のみ含まれる。
 */
export type SessionMonitorStateOutput = Readonly<{
  sessions: readonly {
    sessionId: string;
    displayName: string;
    state: string;
    sourceType: string;
  }[];
  latestSegments: readonly {
    sessionId: string;
    segmentId: string;
    originalText?: string;
    translatedText?: string;
  }[];
  overlayState?: {
    sessionId: string;
    positionPreset: OverlayPositionPreset;
    opacity: number;
    maxLines: number;
    fontScale: number;
    showOriginalText: boolean;
    showTranslatedText: boolean;
  };
}>;
