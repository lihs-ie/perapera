/**
 * オーバーレイ表示設定仕様 (DD-272)。
 *
 * 「オーバーレイ表示値は UI で扱える範囲内に制限する」を個別述語として
 * 提供する。生成時のバリデーションは
 * `domain/profile/overlay-settings.ts` の Zod schema (`createOverlaySettings`)
 * が権威であり、本 spec はそれと同期した intent 明確化 + UI preview 等の
 * 軽量チェック用途。
 *
 * 同期は `overlay-settings-specification.test.ts` の consistency テストで
 * 保証する。
 */

export const OVERLAY_POSITION_PRESETS = ['top', 'bottom', 'floating'] as const;
export type OverlayPositionPreset = (typeof OVERLAY_POSITION_PRESETS)[number];

export const OVERLAY_OPACITY_BOUNDS = { min: 0, max: 1 } as const;
export const OVERLAY_MIN_LINES = 1 as const;

export const isValidOverlayPositionPreset = (value: unknown): value is OverlayPositionPreset => {
  if (typeof value !== 'string') return false;
  return OVERLAY_POSITION_PRESETS.some((preset) => preset === value);
};

export const isValidOverlayOpacity = (value: unknown): boolean =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= OVERLAY_OPACITY_BOUNDS.min &&
  value <= OVERLAY_OPACITY_BOUNDS.max;

export const isValidOverlayMaxLines = (value: unknown): boolean =>
  typeof value === 'number' && Number.isInteger(value) && value >= OVERLAY_MIN_LINES;

export const isValidOverlayFontScale = (value: unknown): boolean =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

export const hasAtLeastOneVisibleText = (
  showOriginalText: boolean,
  showTranslatedText: boolean,
): boolean => showOriginalText || showTranslatedText;
