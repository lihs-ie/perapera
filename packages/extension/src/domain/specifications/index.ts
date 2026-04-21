export {
  MAX_CONCURRENT_ACTIVE_SESSIONS,
  countActiveSessions,
  isActiveSession,
  satisfiesConcurrentSessionLimit,
} from './concurrent-session-limit-specification.js';
export { isValidExportFormat } from './export-format-specification.js';
export {
  OVERLAY_MIN_LINES,
  OVERLAY_OPACITY_BOUNDS,
  OVERLAY_POSITION_PRESETS,
  hasAtLeastOneVisibleText,
  isValidOverlayFontScale,
  isValidOverlayMaxLines,
  isValidOverlayOpacity,
  isValidOverlayPositionPreset,
  type OverlayPositionPreset,
} from './overlay-settings-specification.js';
export { canAttachTranslation } from './translation-attachment-specification.js';
