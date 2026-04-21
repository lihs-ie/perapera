import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import { type DomainError, validationError } from '../../domain/shared/errors';

/**
 * POST /sessions 入力 DTO (api-specification §4.2)。
 *
 * HTTP layer で Zod 検証を通したあと、本 DTO の形式に正規化して UseCase へ
 * 渡す。overlayTarget は discriminated union として維持する。
 */

const overlayTargetSchema = z.union([
  z.object({ kind: z.literal('tab'), tabId: z.number().int().positive() }),
  z.object({ kind: z.literal('extension-monitor'), pageId: z.string().min(1) }),
]);

const issueStreamTokenInputSchema = z.object({
  sourceType: z.enum(['tab', 'microphone', 'desktop']),
  displayName: z.string().min(1),
  sourceLanguage: z.string().nullable(),
  autoDetectLanguage: z.boolean(),
  targetLanguage: z.string(),
  overlayTarget: overlayTargetSchema,
  client: z.object({
    extensionVersion: z.string().min(1),
    protocolVersion: z.string().min(1),
  }),
});

export type IssueStreamTokenInput = z.infer<typeof issueStreamTokenInputSchema>;

export const parseIssueStreamTokenInput = (
  raw: unknown,
): Result<IssueStreamTokenInput, DomainError> => {
  const result = issueStreamTokenInputSchema.safeParse(raw);
  if (!result.success) {
    return err(
      validationError({
        field: 'IssueStreamTokenInput',
        message: result.error.issues.map((issue) => issue.message).join('; '),
      }),
    );
  }
  return ok(result.data);
};

/**
 * POST /sessions 応答 DTO (api-specification §4.2 成功レスポンス)。
 *
 * - `streamToken`: 署名済み JWT 文字列 (WebSocket `Authorization: Bearer` で使用)
 * - `audio` / `limits` は API 仕様に従う固定値 (UseCase 内で合成)
 */
export type IssueStreamTokenAudio = Readonly<{
  encoding: 'pcm_s16le';
  sampleRateHz: 16000;
  channels: 1;
  frameDurationMs: 100;
  transport: 'json-base64';
}>;

export type IssueStreamTokenLimits = Readonly<{
  maxConcurrentSessions: number;
  maxFrameRatePerSecond: number;
}>;

export type IssueStreamTokenOutput = Readonly<{
  sessionId: string;
  streamToken: string;
  relayUrl: string;
  expiresAt: string;
  heartbeatIntervalSec: number;
  audio: IssueStreamTokenAudio;
  limits: IssueStreamTokenLimits;
}>;
