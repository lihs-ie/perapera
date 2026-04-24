import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import { type DomainError, validationError } from '../../domain/shared/errors';
import { type OverlayLine } from '../ports/overlay-presenter';

/**
 * Issue #109: 履歴一覧入力。MVP では filter / pagination は無し (全件取得)。
 * 将来の拡張のために空 input を許容しつつ schema 定義を持つ。
 */
export type GetSessionHistoryInput = Readonly<Record<string, never>>;

const getSessionHistoryInputSchema = z.object({}).optional();

export const parseGetSessionHistoryInput = (
  raw: unknown,
): Result<GetSessionHistoryInput, DomainError> => {
  const parsed = getSessionHistoryInputSchema.safeParse(raw);
  if (!parsed.success) {
    return err(
      validationError({
        field: 'GetSessionHistoryInput',
        message: parsed.error.issues.map((issue) => issue.message).join('; '),
      }),
    );
  }
  return ok({});
};

/**
 * 履歴一覧の 1 件分。stopped 含む全 session を表現する。
 * - `durationMs`: stoppedAt - startedAt (停止前は `null`)
 */
export type SessionHistorySummary = Readonly<{
  sessionId: string;
  displayName: string;
  sourceType: string;
  state: string;
  sourceLanguage: string;
  targetLanguage: string;
  startedAt: string;
  stoppedAt: string | null;
  durationMs: number | null;
}>;

export type SessionHistorySummaryListOutput = Readonly<{
  sessions: readonly SessionHistorySummary[];
}>;

/**
 * 履歴詳細入力。`sessionId` を必須に取る。
 */
export type GetSessionHistoryDetailInput = Readonly<{
  sessionId: string;
}>;

const getSessionHistoryDetailInputSchema = z.object({
  sessionId: z.string().min(1),
});

export const parseGetSessionHistoryDetailInput = (
  raw: unknown,
): Result<GetSessionHistoryDetailInput, DomainError> => {
  const parsed = getSessionHistoryDetailInputSchema.safeParse(raw);
  if (!parsed.success) {
    return err(
      validationError({
        field: 'GetSessionHistoryDetailInput',
        message: parsed.error.issues.map((issue) => issue.message).join('; '),
      }),
    );
  }
  return ok(parsed.data);
};

/**
 * 履歴詳細出力。`summary` に加え read-only `lines` を含める。
 * `lines` は `projectOverlayRenderModel` で投影済の `OverlayLine[]` で、
 * UI 側は `TranscriptPairStream` にそのまま渡せる。
 */
export type SessionHistoryDetailOutput = Readonly<{
  summary: SessionHistorySummary;
  lines: readonly OverlayLine[];
}>;
