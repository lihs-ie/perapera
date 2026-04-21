import { describe, expect, it } from 'vitest';
import { createOverlaySettings } from '../profile/overlay-settings.js';
import {
  OVERLAY_MIN_LINES,
  OVERLAY_OPACITY_BOUNDS,
  OVERLAY_POSITION_PRESETS,
  hasAtLeastOneVisibleText,
  isValidOverlayFontScale,
  isValidOverlayMaxLines,
  isValidOverlayOpacity,
  isValidOverlayPositionPreset,
} from './overlay-settings-specification.js';

describe('OverlaySettingsSpecification (DD-272)', () => {
  describe('isValidOverlayPositionPreset', () => {
    it.each(OVERLAY_POSITION_PRESETS)('accepts %s', (preset) => {
      expect(isValidOverlayPositionPreset(preset)).toBe(true);
    });

    it('rejects unknown string values', () => {
      expect(isValidOverlayPositionPreset('center')).toBe(false);
      expect(isValidOverlayPositionPreset('TOP')).toBe(false); // case-sensitive
      expect(isValidOverlayPositionPreset('')).toBe(false);
    });

    it('rejects non-string values', () => {
      expect(isValidOverlayPositionPreset(0)).toBe(false);
      expect(isValidOverlayPositionPreset(null)).toBe(false);
      expect(isValidOverlayPositionPreset(undefined)).toBe(false);
    });
  });

  describe('isValidOverlayOpacity', () => {
    it('accepts the boundary values 0 and 1', () => {
      expect(isValidOverlayOpacity(OVERLAY_OPACITY_BOUNDS.min)).toBe(true);
      expect(isValidOverlayOpacity(OVERLAY_OPACITY_BOUNDS.max)).toBe(true);
    });

    it('accepts mid-range values', () => {
      expect(isValidOverlayOpacity(0.5)).toBe(true);
      expect(isValidOverlayOpacity(0.8)).toBe(true);
    });

    it('rejects out-of-range values', () => {
      expect(isValidOverlayOpacity(-0.0001)).toBe(false);
      expect(isValidOverlayOpacity(1.0001)).toBe(false);
    });

    it('rejects non-finite numbers', () => {
      expect(isValidOverlayOpacity(Number.NaN)).toBe(false);
      expect(isValidOverlayOpacity(Number.POSITIVE_INFINITY)).toBe(false);
      expect(isValidOverlayOpacity(Number.NEGATIVE_INFINITY)).toBe(false);
    });

    it('rejects non-number values', () => {
      expect(isValidOverlayOpacity('0.5')).toBe(false);
      expect(isValidOverlayOpacity(null)).toBe(false);
    });
  });

  describe('isValidOverlayMaxLines', () => {
    it('accepts the minimum boundary', () => {
      expect(isValidOverlayMaxLines(OVERLAY_MIN_LINES)).toBe(true);
    });

    it('accepts larger integers', () => {
      expect(isValidOverlayMaxLines(2)).toBe(true);
      expect(isValidOverlayMaxLines(100)).toBe(true);
    });

    it('rejects values below the minimum', () => {
      expect(isValidOverlayMaxLines(0)).toBe(false);
      expect(isValidOverlayMaxLines(-1)).toBe(false);
    });

    it('rejects non-integer numbers', () => {
      expect(isValidOverlayMaxLines(1.5)).toBe(false);
      expect(isValidOverlayMaxLines(Number.NaN)).toBe(false);
    });

    it('rejects non-number values', () => {
      expect(isValidOverlayMaxLines('2')).toBe(false);
      expect(isValidOverlayMaxLines(null)).toBe(false);
    });
  });

  describe('isValidOverlayFontScale', () => {
    it('accepts positive finite numbers', () => {
      expect(isValidOverlayFontScale(0.1)).toBe(true);
      expect(isValidOverlayFontScale(1)).toBe(true);
      expect(isValidOverlayFontScale(2.5)).toBe(true);
    });

    it('rejects zero and negative numbers', () => {
      expect(isValidOverlayFontScale(0)).toBe(false);
      expect(isValidOverlayFontScale(-0.1)).toBe(false);
    });

    it('rejects non-finite values', () => {
      expect(isValidOverlayFontScale(Number.POSITIVE_INFINITY)).toBe(false);
      expect(isValidOverlayFontScale(Number.NaN)).toBe(false);
    });
  });

  describe('hasAtLeastOneVisibleText', () => {
    it('returns true when at least one of the two flags is true', () => {
      expect(hasAtLeastOneVisibleText(true, true)).toBe(true);
      expect(hasAtLeastOneVisibleText(true, false)).toBe(true);
      expect(hasAtLeastOneVisibleText(false, true)).toBe(true);
    });

    it('returns false when both flags are false', () => {
      expect(hasAtLeastOneVisibleText(false, false)).toBe(false);
    });
  });

  describe('consistency with createOverlaySettings (Zod schema as authoritative)', () => {
    it('each individual spec boundary matches what createOverlaySettings accepts', () => {
      // positive control: all boundary values simultaneously should be accepted
      const result = createOverlaySettings({
        positionPreset: OVERLAY_POSITION_PRESETS[0],
        opacity: OVERLAY_OPACITY_BOUNDS.min,
        maxLines: OVERLAY_MIN_LINES,
        fontScale: 0.1,
        showOriginalText: true,
        showTranslatedText: false,
      });
      expect(result.isOk()).toBe(true);
    });

    it('rejecting either visibility flag at both-false keeps createOverlaySettings consistent', () => {
      const result = createOverlaySettings({
        positionPreset: 'top',
        opacity: 0.5,
        maxLines: 2,
        fontScale: 1,
        showOriginalText: false,
        showTranslatedText: false,
      });
      expect(result.isErr()).toBe(true);
      expect(hasAtLeastOneVisibleText(false, false)).toBe(false);
    });
  });
});
