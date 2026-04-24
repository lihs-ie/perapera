import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import { type ApplicationError } from '../application/errors/application-errors';
import { GLOSSARY_ENTRY_FIELD_MAX_LENGTH, GLOSSARY_MAX_ENTRIES } from '../domain/glossary';
import {
  RETENTION_DAYS_MAX,
  RETENTION_DAYS_MIN,
  RETENTION_MAX_COUNT_MAX,
  RETENTION_MAX_COUNT_MIN,
} from '../domain/retention';
import {
  SEARCH_KEYWORD_MAX_LENGTH,
  SEARCH_KEYWORD_MIN_LENGTH,
  TRANSCRIPT_SEARCH_LANGUAGES,
} from '../domain/search';
import { validationError, type DomainError } from '../domain/shared/errors';

/**
 * IMPL-501 Runtime message schema (Popup / SidePanel ↔ Background)。
 *
 * chrome.runtime.onMessage ベースの Request / Response 形式。全ペイロードは
 * Zod で validation し、不正は `validationError` として弾く。
 *
 * **設計メモ**:
 * - Request と Response は常にタグ付き discriminated union
 * - Response の `ok` フラグでエラー分岐 (Result 風)。UseCase 側の
 *   ApplicationError をそのまま serialize して UI 側に届ける
 * - Application 層の DTO (`StartSourceSessionInput` 等) を直接渡さず、
 *   本層でも独立スキーマを持つ (presentation 層が application 層に直接
 *   依存しない境界を保つ)
 */

const sourceTypeSchema = z.enum(['tab', 'microphone', 'desktop']);
const bcp47Schema = z.string().regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/);

const overlayTargetSchema = z.object({
  kind: z.enum(['tab', 'extension-monitor']),
  tabId: z.number().int().nonnegative().optional(),
  pageId: z.string().min(1).optional(),
});

const startSourceSessionRequestSchema = z.object({
  type: z.literal('command.start-source-session'),
  input: z.object({
    sourceType: sourceTypeSchema,
    displayName: z.string().min(1),
    sourceLanguage: bcp47Schema.nullable().optional(),
    autoDetectLanguage: z.boolean(),
    targetLanguage: bcp47Schema,
    overlayTarget: overlayTargetSchema,
  }),
});

const stopSourceSessionRequestSchema = z.object({
  type: z.literal('command.stop-source-session'),
  input: z.object({
    sessionId: z.string().min(1),
  }),
});

/**
 * overlaySettings 更新は全フィールド必須 (application layer DTO 準拠)。
 * 省略したい場合は request 自体で `overlaySettings` を undefined に。
 */
const overlaySettingsPayloadSchema = z.object({
  positionPreset: z.enum(['top', 'bottom', 'floating']),
  opacity: z.number().min(0).max(1),
  maxLines: z.number().int().min(1),
  fontScale: z.number().positive(),
  showOriginalText: z.boolean(),
  showTranslatedText: z.boolean(),
});

const updateSourceSettingsRequestSchema = z.object({
  type: z.literal('command.update-source-settings'),
  input: z.object({
    sessionId: z.string().min(1),
    sourceLanguage: bcp47Schema.nullable().optional(),
    targetLanguage: bcp47Schema.optional(),
    overlaySettings: overlaySettingsPayloadSchema.optional(),
  }),
});

const exportSessionResultRequestSchema = z.object({
  type: z.literal('command.export-session-result'),
  input: z.object({
    sessionId: z.string().min(1),
    format: z.enum(['txt', 'json']),
    includeOriginal: z.boolean(),
    includeTranslation: z.boolean(),
  }),
});

const getSessionMonitorStateRequestSchema = z.object({
  type: z.literal('query.get-session-monitor-state'),
  input: z.object({
    sessionIds: z.array(z.string().min(1)).min(1).optional(),
    includeOverlayState: z.boolean(),
  }),
});

const getDefaultSettingsRequestSchema = z.object({
  type: z.literal('query.get-default-settings'),
  input: z.object({}).optional(),
});

const getSessionHistoryRequestSchema = z.object({
  type: z.literal('query.get-session-history'),
  input: z.object({}).optional(),
});

const getSessionHistoryDetailRequestSchema = z.object({
  type: z.literal('query.get-session-history-detail'),
  input: z.object({
    sessionId: z.string().min(1),
  }),
});

const defaultLanguagePairPayloadSchema = z.object({
  source: bcp47Schema,
  target: bcp47Schema,
});

const saveDefaultLanguagePairRequestSchema = z.object({
  type: z.literal('command.save-default-language-pair'),
  input: defaultLanguagePairPayloadSchema,
});

const saveDefaultOverlaySettingsRequestSchema = z.object({
  type: z.literal('command.save-default-overlay-settings'),
  input: overlaySettingsPayloadSchema,
});

const endpointingPolicyPayloadSchema = z.object({
  silenceThresholdMs: z.number().int().min(200).max(1200),
  punctuationAware: z.boolean(),
  minUtteranceMs: z.number().int().min(100).max(3000),
});

const saveDefaultEndpointingPolicyRequestSchema = z.object({
  type: z.literal('command.save-default-endpointing-policy'),
  input: endpointingPolicyPayloadSchema,
});

const translationContextWindowPayloadSchema = z.object({
  maxSegments: z.number().int().min(0).max(5),
  includeTranslatedText: z.boolean(),
});

const saveDefaultTranslationContextWindowRequestSchema = z.object({
  type: z.literal('command.save-default-translation-context-window'),
  input: translationContextWindowPayloadSchema,
});

const relayOverridePayloadSchema = z.object({
  baseUrl: z.string().url(),
  accessToken: z.string().min(16),
});

const saveRelayConnectionOverrideRequestSchema = z.object({
  type: z.literal('command.save-relay-connection-override'),
  input: relayOverridePayloadSchema,
});

const clearRelayConnectionOverrideRequestSchema = z.object({
  type: z.literal('command.clear-relay-connection-override'),
  input: z.object({}).optional(),
});

const glossaryEntryPayloadSchema = z.object({
  source: z.string().min(1).max(GLOSSARY_ENTRY_FIELD_MAX_LENGTH),
  target: z.string().min(1).max(GLOSSARY_ENTRY_FIELD_MAX_LENGTH),
  caseSensitive: z.boolean(),
});

const glossaryPayloadSchema = z.object({
  entries: z.array(glossaryEntryPayloadSchema).max(GLOSSARY_MAX_ENTRIES),
});

const saveDefaultGlossaryRequestSchema = z.object({
  type: z.literal('command.save-default-glossary'),
  input: glossaryPayloadSchema,
});

const getDefaultGlossaryRequestSchema = z.object({
  type: z.literal('query.get-default-glossary'),
  input: z.object({}).optional(),
});

const retentionPolicyPayloadSchema = z.object({
  days: z.number().int().min(RETENTION_DAYS_MIN).max(RETENTION_DAYS_MAX).nullable(),
  maxCount: z.number().int().min(RETENTION_MAX_COUNT_MIN).max(RETENTION_MAX_COUNT_MAX).nullable(),
});

const saveSessionRetentionPolicyRequestSchema = z.object({
  type: z.literal('command.save-session-retention-policy'),
  input: retentionPolicyPayloadSchema,
});

const getSessionRetentionPolicyRequestSchema = z.object({
  type: z.literal('query.get-session-retention-policy'),
  input: z.object({}).optional(),
});

const purgeExpiredSessionsRequestSchema = z.object({
  type: z.literal('command.purge-expired-sessions'),
  input: z.object({}).optional(),
});

const purgeAllSessionsRequestSchema = z.object({
  type: z.literal('command.purge-all-sessions'),
  input: z.object({}).optional(),
});

const searchSessionHistoryRequestSchema = z.object({
  type: z.literal('query.search-session-history'),
  input: z.object({
    keyword: z.string().min(SEARCH_KEYWORD_MIN_LENGTH).max(SEARCH_KEYWORD_MAX_LENGTH),
    language: z.enum(TRANSCRIPT_SEARCH_LANGUAGES),
    caseSensitive: z.boolean(),
  }),
});

const toggleTranscriptBookmarkRequestSchema = z.object({
  type: z.literal('command.toggle-transcript-bookmark'),
  input: z.object({
    sessionId: z.string().min(1),
    segmentId: z.string().min(1),
  }),
});

const getBookmarkedSegmentsRequestSchema = z.object({
  type: z.literal('query.get-bookmarked-segments'),
  input: z.object({}).optional(),
});

export const backgroundRequestSchema = z.discriminatedUnion('type', [
  startSourceSessionRequestSchema,
  stopSourceSessionRequestSchema,
  updateSourceSettingsRequestSchema,
  exportSessionResultRequestSchema,
  getSessionMonitorStateRequestSchema,
  getDefaultSettingsRequestSchema,
  saveDefaultLanguagePairRequestSchema,
  saveDefaultOverlaySettingsRequestSchema,
  saveDefaultEndpointingPolicyRequestSchema,
  saveDefaultTranslationContextWindowRequestSchema,
  saveRelayConnectionOverrideRequestSchema,
  clearRelayConnectionOverrideRequestSchema,
  saveDefaultGlossaryRequestSchema,
  getDefaultGlossaryRequestSchema,
  saveSessionRetentionPolicyRequestSchema,
  getSessionRetentionPolicyRequestSchema,
  purgeExpiredSessionsRequestSchema,
  purgeAllSessionsRequestSchema,
  searchSessionHistoryRequestSchema,
  toggleTranscriptBookmarkRequestSchema,
  getBookmarkedSegmentsRequestSchema,
  getSessionHistoryRequestSchema,
  getSessionHistoryDetailRequestSchema,
]);

export type BackgroundRequest = z.infer<typeof backgroundRequestSchema>;

/**
 * 成功レスポンス (UseCase の output DTO をそのまま bundle)
 * エラーレスポンス (`ApplicationError` の識別子・フィールドを保持)。
 *
 * NOTE: Popup / SidePanel 側 (presentation layer) は `ApplicationError` の
 * 具体型を知らなくてよい。discriminator (`type`) / `message` だけで UI 判定
 * 可能な形で渡す (`ApplicationError` の type 列挙は use case 設計書
 * §9.2 参照)。
 */
export type BackgroundResponse<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: ApplicationError }>;

/**
 * Request を parse する helper。Popup 側から届いた任意 shape の unknown を
 * 受け取り、discriminated union にマッピングする。失敗は `DomainError`
 * (validation) で返す。
 */
export const parseBackgroundRequest = (raw: unknown): Result<BackgroundRequest, DomainError> => {
  const result = backgroundRequestSchema.safeParse(raw);
  if (!result.success) {
    return err(
      validationError({
        field: 'BackgroundRequest',
        message: result.error.issues.map((issue) => issue.message).join('; '),
      }),
    );
  }
  return ok(result.data);
};
