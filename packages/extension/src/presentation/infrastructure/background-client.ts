import { z } from 'zod';
import { type ExportSessionResultInput } from '../../application/dto/export-session-result-dto';
import { type GetSessionMonitorStateInput } from '../../application/dto/get-session-monitor-state-dto';
import { type StartSourceSessionInput } from '../../application/dto/start-source-session-dto';
import { type StopSourceSessionInput } from '../../application/dto/stop-source-session-dto';
import { type UpdateSourceSettingsInput } from '../../application/dto/update-source-settings-dto';
import {
  type ApplicationError,
  internalAppError,
} from '../../application/errors/application-errors';

/**
 * IMPL-514 Popup/SidePanel → Background のメッセージングクライアント。
 *
 * `chrome.runtime.sendMessage` を本番 default として wrap し、各 UseCase に
 * 対応する型付きメソッドを公開する。応答は Zod で validation したうえで
 * `BackgroundResponse<T>` に narrow する (Background 側の JSON を盲信しない)。
 *
 * **本番実装で mock を使わない設計**:
 * - `sender` は必須 DI (default `defaultBackgroundMessageSender` 明示注入)
 * - test では fake sender を inject
 * - presentation 層から infrastructure 層への依存は本 client のみ
 */
export type BackgroundMessageSender = Readonly<{
  /** 任意の JSON を Background に送り、response を取得する。拒否は rejection */
  send: (message: unknown) => Promise<unknown>;
}>;

export const defaultBackgroundMessageSender: BackgroundMessageSender = {
  send: (message) => chrome.runtime.sendMessage(message),
};

/**
 * Popup 側が Background から受け取るレスポンス型。
 * `runtime-messages.ts` の `BackgroundResponse<T>` と同じ shape だが、
 * presentation 層は application 層の詳細型を直接 import せず本ファイル経由で扱う。
 */
export type BackgroundResponse<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: ApplicationError }>;

const applicationErrorSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('permission-required'),
    code: z.literal('CAPTURE-PERMISSION-DENIED'),
    sourceType: z.string(),
    message: z.string(),
  }),
  z.object({
    type: z.literal('session-not-found'),
    code: z.literal('SESSION_NOT_FOUND'),
    identifier: z.string(),
    message: z.string(),
  }),
  z.object({
    type: z.literal('validation'),
    code: z.enum(['VALIDATION_FAILED', 'UNSUPPORTED_LANGUAGE_PAIR']),
    field: z.string().nullable(),
    message: z.string(),
  }),
  z.object({
    type: z.literal('conflict'),
    code: z.literal('INVALID_STATE_TRANSITION'),
    details: z.string(),
    message: z.string(),
  }),
  z.object({
    type: z.literal('internal'),
    code: z.literal('INTERNAL_ERROR'),
    message: z.string(),
  }),
]);

const startSourceSessionOutputSchema = z.object({
  sessionId: z.string().min(1),
  state: z.string().min(1),
  startedAt: z.string().min(1),
});
export type StartSourceSessionResult = z.infer<typeof startSourceSessionOutputSchema>;

const stopSourceSessionOutputSchema = z.object({
  sessionId: z.string().min(1),
  state: z.string().min(1),
  stoppedAt: z.string().min(1),
});
export type StopSourceSessionResult = z.infer<typeof stopSourceSessionOutputSchema>;

const updateSourceSettingsOutputSchema = z.object({
  sessionId: z.string().min(1),
  appliedAt: z.string().min(1),
});
export type UpdateSourceSettingsResult = z.infer<typeof updateSourceSettingsOutputSchema>;

const exportSessionResultOutputSchema = z.object({
  exportId: z.string().min(1),
  format: z.enum(['txt', 'json']),
  bytes: z.number().int().nonnegative(),
});
export type ExportSessionResultResult = z.infer<typeof exportSessionResultOutputSchema>;

const sessionMonitorStateOutputSchema = z.object({
  sessions: z.array(
    z.object({
      sessionId: z.string().min(1),
      displayName: z.string(),
      state: z.string().min(1),
      sourceType: z.string().min(1),
    }),
  ),
  latestSegments: z.array(
    z.object({
      sessionId: z.string().min(1),
      segmentId: z.string().min(1),
      originalText: z.string().optional(),
      translatedText: z.string().optional(),
    }),
  ),
  overlayState: z
    .object({
      positionPreset: z.string(),
      opacity: z.number(),
      maxLines: z.number(),
      fontScale: z.number(),
      showOriginalText: z.boolean(),
      showTranslatedText: z.boolean(),
    })
    .optional(),
});
export type SessionMonitorStateResult = z.infer<typeof sessionMonitorStateOutputSchema>;

const toInternal = (cause: unknown): ApplicationError =>
  internalAppError({
    message: `background-client: sender failed: ${cause instanceof Error ? cause.message : String(cause)}`,
  });

const sendTyped = async <Schema extends z.ZodTypeAny>(
  sender: BackgroundMessageSender,
  message: unknown,
  valueSchema: Schema,
): Promise<BackgroundResponse<z.infer<Schema>>> => {
  try {
    const raw = await sender.send(message);
    const envelopeSchema = z.discriminatedUnion('ok', [
      z.object({ ok: z.literal(true), value: valueSchema }),
      z.object({ ok: z.literal(false), error: applicationErrorSchema }),
    ]);
    const parsed = envelopeSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: internalAppError({
          message: `background-client: malformed response: ${parsed.error.issues
            .map((issue) => issue.message)
            .join('; ')}`,
        }),
      };
    }
    if ('error' in parsed.data) {
      return { ok: false, error: parsed.data.error };
    }
    return { ok: true, value: parsed.data.value };
  } catch (cause) {
    return { ok: false, error: toInternal(cause) };
  }
};

export type BackgroundClient = Readonly<{
  startSourceSession: (
    input: StartSourceSessionInput,
  ) => Promise<BackgroundResponse<StartSourceSessionResult>>;
  stopSourceSession: (
    input: StopSourceSessionInput,
  ) => Promise<BackgroundResponse<StopSourceSessionResult>>;
  updateSourceSettings: (
    input: UpdateSourceSettingsInput,
  ) => Promise<BackgroundResponse<UpdateSourceSettingsResult>>;
  exportSessionResult: (
    input: ExportSessionResultInput,
  ) => Promise<BackgroundResponse<ExportSessionResultResult>>;
  getSessionMonitorState: (
    input: GetSessionMonitorStateInput,
  ) => Promise<BackgroundResponse<SessionMonitorStateResult>>;
}>;

/**
 * Popup / SidePanel が利用するタイプセーフな messaging client。
 * default では `chrome.runtime.sendMessage` を使う。test では
 * `createBackgroundClient({ send: fakeImpl })` で fake sender を inject する。
 */
export const createBackgroundClient = (
  sender: BackgroundMessageSender = defaultBackgroundMessageSender,
): BackgroundClient => ({
  startSourceSession: (input) =>
    sendTyped(
      sender,
      { type: 'command.start-source-session', input },
      startSourceSessionOutputSchema,
    ),
  stopSourceSession: (input) =>
    sendTyped(
      sender,
      { type: 'command.stop-source-session', input },
      stopSourceSessionOutputSchema,
    ),
  updateSourceSettings: (input) =>
    sendTyped(
      sender,
      { type: 'command.update-source-settings', input },
      updateSourceSettingsOutputSchema,
    ),
  exportSessionResult: (input) =>
    sendTyped(
      sender,
      { type: 'command.export-session-result', input },
      exportSessionResultOutputSchema,
    ),
  getSessionMonitorState: (input) =>
    sendTyped(
      sender,
      { type: 'query.get-session-monitor-state', input },
      sessionMonitorStateOutputSchema,
    ),
});
