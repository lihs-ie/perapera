import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import { createOverlaySettings, type OverlaySettings } from '../../domain/profile/overlay-settings';
import {
  type OverlayLine,
  type OverlayRenderModel,
} from '../../application/ports/overlay-presenter';
import {
  parseSegmentIdentifier,
  type SegmentIdentifier,
} from '../../domain/transcript/segment-identifier';
import {
  parseSessionIdentifier,
  type SessionIdentifier,
} from '../../domain/session/session-identifier';
import { validationError, type DomainError } from '../../domain/shared/errors';

/**
 * IMPL-554 OverlayCommand の runtime validation。
 *
 * Background Service Worker (`ChromeMessagingOverlayPresenter`) から
 * chrome.runtime.sendMessage 経由で届くメッセージを受け取る際、content script
 * 側では JSON 形式の untrusted payload として扱い、Zod で validation する。
 *
 * SW 側の TypeScript `OverlayCommand` 型 (`chrome-messaging-overlay-presenter.ts`)
 * と shape を同期する。branded ドメイン型 (`SessionIdentifier` /
 * `SegmentIdentifier` / `OverlaySettings`) は既存 parser 関数を通して構築する。
 *
 * 検証失敗時は `validationError` を返し、呼び出し側 (content entry) は
 * OverlayCommand 以外の message として silent ignore する。
 */

const overlayLineRawSchema = z.object({
  segmentIdentifier: z.string().min(1),
  originalText: z.string().nullable(),
  translatedText: z.string().nullable(),
  targetLanguage: z.string().nullable(),
  isFinal: z.boolean(),
  // IMPL-539: 追加フィールドは optional + default で v0.1 互換
  precedingSegmentIdentifier: z.string().min(1).nullable().optional(),
  hasTranslationContext: z.boolean().optional(),
});

const overlayRenderModelRawSchema = z.object({
  sessionIdentifier: z.string().min(1),
  lines: z.array(overlayLineRawSchema),
});

const overlaySettingsRawSchema = z.object({
  positionPreset: z.enum(['top', 'bottom', 'floating']),
  opacity: z.number().min(0).max(1),
  maxLines: z.number().int().min(1),
  fontScale: z.number().positive(),
  showOriginalText: z.boolean(),
  showTranslatedText: z.boolean(),
});

const mountCommandSchema = z.object({
  type: z.literal('overlay.mount'),
  sessionIdentifier: z.string().min(1),
});

const renderCommandSchema = z.object({
  type: z.literal('overlay.render'),
  model: overlayRenderModelRawSchema,
});

const updateSettingsCommandSchema = z.object({
  type: z.literal('overlay.update-settings'),
  sessionIdentifier: z.string().min(1),
  settings: overlaySettingsRawSchema,
});

const unmountCommandSchema = z.object({
  type: z.literal('overlay.unmount'),
  sessionIdentifier: z.string().min(1),
});

const overlayCommandRawSchema = z.discriminatedUnion('type', [
  mountCommandSchema,
  renderCommandSchema,
  updateSettingsCommandSchema,
  unmountCommandSchema,
]);

/**
 * 検証済 OverlayCommand 型。SW 側の `OverlayCommand` と shape 互換だが、
 * 識別子は branded ドメイン型に変換済 (`SessionIdentifier` /
 * `SegmentIdentifier`)。settings / OverlayLine フィールドは raw shape のまま
 * 渡す (presentation 側の OverlayPresenter が受ける型と同じ)。
 */
export type OverlayCommand =
  | Readonly<{ type: 'overlay.mount'; sessionIdentifier: SessionIdentifier }>
  | Readonly<{ type: 'overlay.render'; model: OverlayRenderModel }>
  | Readonly<{
      type: 'overlay.update-settings';
      sessionIdentifier: SessionIdentifier;
      settings: OverlaySettings;
    }>
  | Readonly<{ type: 'overlay.unmount'; sessionIdentifier: SessionIdentifier }>;

const toOverlayLine = (
  raw: z.infer<typeof overlayLineRawSchema>,
): Result<OverlayLine, DomainError> =>
  parseSegmentIdentifier(raw.segmentIdentifier).andThen((segmentIdentifier) => {
    const precedingRaw = raw.precedingSegmentIdentifier;
    const parsePreceding =
      precedingRaw === undefined || precedingRaw === null
        ? ok<SegmentIdentifier | null, DomainError>(null)
        : parseSegmentIdentifier(precedingRaw).map((id): SegmentIdentifier | null => id);
    return parsePreceding.map(
      (precedingSegmentIdentifier): OverlayLine => ({
        segmentIdentifier,
        originalText: raw.originalText,
        translatedText: raw.translatedText,
        targetLanguage: raw.targetLanguage,
        isFinal: raw.isFinal,
        precedingSegmentIdentifier,
        hasTranslationContext: raw.hasTranslationContext ?? false,
      }),
    );
  });

const toOverlayRenderModel = (
  raw: z.infer<typeof overlayRenderModelRawSchema>,
): Result<OverlayRenderModel, DomainError> =>
  parseSessionIdentifier(raw.sessionIdentifier).andThen((sessionIdentifier) => {
    const lines: OverlayLine[] = [];
    for (const rawLine of raw.lines) {
      const parsed = toOverlayLine(rawLine);
      if (parsed.isErr()) return err(parsed.error);
      lines.push(parsed.value);
    }
    return ok<OverlayRenderModel, DomainError>({ sessionIdentifier, lines });
  });

/**
 * OverlaySettings raw payload を branded aggregate に変換する。`createOverlaySettings`
 * factory を再利用して不変条件 (showOriginalText || showTranslatedText) まで検証する。
 */
const toOverlaySettings = (
  raw: z.infer<typeof overlaySettingsRawSchema>,
): Result<OverlaySettings, DomainError> => createOverlaySettings(raw);

export const parseOverlayCommand = (raw: unknown): Result<OverlayCommand, DomainError> => {
  const parsed = overlayCommandRawSchema.safeParse(raw);
  if (!parsed.success) {
    return err(
      validationError({
        field: 'OverlayCommand',
        message: parsed.error.issues.map((issue) => issue.message).join('; '),
      }),
    );
  }
  const data = parsed.data;
  switch (data.type) {
    case 'overlay.mount':
      return parseSessionIdentifier(data.sessionIdentifier).map(
        (sessionIdentifier): OverlayCommand => ({
          type: 'overlay.mount',
          sessionIdentifier,
        }),
      );
    case 'overlay.render':
      return toOverlayRenderModel(data.model).map(
        (model): OverlayCommand => ({
          type: 'overlay.render',
          model,
        }),
      );
    case 'overlay.update-settings':
      return parseSessionIdentifier(data.sessionIdentifier).andThen((sessionIdentifier) =>
        toOverlaySettings(data.settings).map(
          (settings): OverlayCommand => ({
            type: 'overlay.update-settings',
            sessionIdentifier,
            settings,
          }),
        ),
      );
    case 'overlay.unmount':
      return parseSessionIdentifier(data.sessionIdentifier).map(
        (sessionIdentifier): OverlayCommand => ({
          type: 'overlay.unmount',
          sessionIdentifier,
        }),
      );
  }
};
