import { describe, expect, it } from 'vitest';
import { createOverlaySettings } from './overlay-settings.js';

const baseValid = {
  positionPreset: 'bottom' as const,
  opacity: 0.85,
  maxLines: 2,
  fontScale: 1,
  showOriginalText: true,
  showTranslatedText: true,
};

describe('OverlaySettings', () => {
  it('accepts valid settings', () => {
    const result = createOverlaySettings(baseValid);
    expect(result.isOk()).toBe(true);
  });

  it('accepts opacity 0 and 1 (boundary)', () => {
    expect(createOverlaySettings({ ...baseValid, opacity: 0 }).isOk()).toBe(true);
    expect(createOverlaySettings({ ...baseValid, opacity: 1 }).isOk()).toBe(true);
  });

  it('rejects opacity outside 0-1', () => {
    expect(createOverlaySettings({ ...baseValid, opacity: 1.1 }).isErr()).toBe(true);
    expect(createOverlaySettings({ ...baseValid, opacity: -0.1 }).isErr()).toBe(true);
  });

  it('rejects maxLines < 1', () => {
    expect(createOverlaySettings({ ...baseValid, maxLines: 0 }).isErr()).toBe(true);
  });

  it('rejects non-integer maxLines', () => {
    expect(createOverlaySettings({ ...baseValid, maxLines: 1.5 }).isErr()).toBe(true);
  });

  it('rejects non-positive fontScale', () => {
    expect(createOverlaySettings({ ...baseValid, fontScale: 0 }).isErr()).toBe(true);
    expect(createOverlaySettings({ ...baseValid, fontScale: -1 }).isErr()).toBe(true);
  });

  it('rejects unknown positionPreset', () => {
    const result = createOverlaySettings({
      ...baseValid,
      positionPreset: 'middle',
    });
    expect(result.isErr()).toBe(true);
  });

  it('rejects when both showOriginalText and showTranslatedText are false', () => {
    const result = createOverlaySettings({
      ...baseValid,
      showOriginalText: false,
      showTranslatedText: false,
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('validation');
  });
});
