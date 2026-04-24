import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import {
  GLOSSARY_ENTRY_FIELD_MAX_LENGTH,
  GLOSSARY_MAX_ENTRIES,
} from '../../domain/session/glossary';
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

/**
 * IMPL-405 (v0.2.0): `endpointing` / `translationContext` フィールドを追加。
 * いずれも optional で、個別フィールドも optional。未指定時は Relay 側で
 * 既定値 (`DEFAULT_ENDPOINTING_POLICY` / `DEFAULT_TRANSLATION_CONTEXT_WINDOW`)
 * を適用する (api-specification.md §5 API-002)。
 */
const endpointingPolicyInputSchema = z
  .object({
    silenceThresholdMs: z.number().int().min(200).max(1200).optional(),
    punctuationAware: z.boolean().optional(),
    minUtteranceMs: z.number().int().min(100).max(3000).optional(),
  })
  .optional();

const translationContextWindowInputSchema = z
  .object({
    maxSegments: z.number().int().min(0).max(5).optional(),
    includeTranslatedText: z.boolean().optional(),
    /** IMPL-460: 0〜150ms (既定 0 = 無効、feature flag) */
    holdWindowMs: z.number().int().min(0).max(150).optional(),
  })
  .optional();

/**
 * IMPL-448 (Issue #123): カスタム用語集 (Glossary)。セッション開始時に一括
 * 受信し、`TranslationPort` の request に添えて LLM system prompt 注入や
 * 後処理置換に利用する。NMT 系プロバイダでも後処理置換は有効。
 */
const glossaryEntryInputSchema = z.object({
  source: z.string().min(1).max(GLOSSARY_ENTRY_FIELD_MAX_LENGTH),
  target: z.string().min(1).max(GLOSSARY_ENTRY_FIELD_MAX_LENGTH),
  caseSensitive: z.boolean(),
});

const glossaryInputSchema = z
  .object({
    entries: z.array(glossaryEntryInputSchema).max(GLOSSARY_MAX_ENTRIES),
  })
  .optional();

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
  endpointing: endpointingPolicyInputSchema,
  translationContext: translationContextWindowInputSchema,
  glossary: glossaryInputSchema,
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
