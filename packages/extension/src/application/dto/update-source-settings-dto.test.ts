import { describe, expect, it } from 'vitest';
import {
  parseUpdateSourceSettingsInput,
  type UpdateSourceSettingsInput,
  type UpdateSourceSettingsOutput,
} from './update-source-settings-dto';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';

describe('UpdateSourceSettingsDTO (DD-303)', () => {
  describe('parseUpdateSourceSettingsInput', () => {
    it('accepts the minimum payload (sessionId only, all optional fields omitted)', () => {
      const result = parseUpdateSourceSettingsInput({ sessionId: SESSION_ID });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value.sessionId).toBe(SESSION_ID);
    });

    it('accepts language pair updates', () => {
      const result = parseUpdateSourceSettingsInput({
        sessionId: SESSION_ID,
        sourceLanguage: 'en-US',
        targetLanguage: 'ja-JP',
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.sourceLanguage).toBe('en-US');
        expect(result.value.targetLanguage).toBe('ja-JP');
      }
    });

    it('accepts sourceLanguage=null (auto-detect reset)', () => {
      const result = parseUpdateSourceSettingsInput({
        sessionId: SESSION_ID,
        sourceLanguage: null,
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value.sourceLanguage).toBeNull();
    });

    it('accepts a valid overlaySettings object', () => {
      const result = parseUpdateSourceSettingsInput({
        sessionId: SESSION_ID,
        overlaySettings: {
          positionPreset: 'bottom',
          opacity: 0.8,
          maxLines: 2,
          fontScale: 1,
          showOriginalText: true,
          showTranslatedText: false,
        },
      });
      expect(result.isOk()).toBe(true);
    });

    it('rejects out-of-range opacity', () => {
      const result = parseUpdateSourceSettingsInput({
        sessionId: SESSION_ID,
        overlaySettings: {
          positionPreset: 'bottom',
          opacity: 1.5,
          maxLines: 2,
          fontScale: 1,
          showOriginalText: true,
          showTranslatedText: true,
        },
      });
      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.kind).toBe('validation');
    });

    it('rejects non-integer maxLines', () => {
      const result = parseUpdateSourceSettingsInput({
        sessionId: SESSION_ID,
        overlaySettings: {
          positionPreset: 'top',
          opacity: 0.5,
          maxLines: 1.5,
          fontScale: 1,
          showOriginalText: true,
          showTranslatedText: true,
        },
      });
      expect(result.isErr()).toBe(true);
    });

    it('rejects zero or negative fontScale', () => {
      const result = parseUpdateSourceSettingsInput({
        sessionId: SESSION_ID,
        overlaySettings: {
          positionPreset: 'top',
          opacity: 0.5,
          maxLines: 2,
          fontScale: 0,
          showOriginalText: true,
          showTranslatedText: true,
        },
      });
      expect(result.isErr()).toBe(true);
    });

    it('rejects unknown positionPreset', () => {
      const result = parseUpdateSourceSettingsInput({
        sessionId: SESSION_ID,
        overlaySettings: {
          positionPreset: 'center',
          opacity: 0.5,
          maxLines: 2,
          fontScale: 1,
          showOriginalText: true,
          showTranslatedText: true,
        },
      });
      expect(result.isErr()).toBe(true);
    });

    it('rejects malformed BCP-47 source language', () => {
      const result = parseUpdateSourceSettingsInput({
        sessionId: SESSION_ID,
        sourceLanguage: 'NOT_A_TAG',
      });
      expect(result.isErr()).toBe(true);
    });

    it('rejects missing sessionId', () => {
      const result = parseUpdateSourceSettingsInput({
        sourceLanguage: 'en-US',
      });
      expect(result.isErr()).toBe(true);
    });
  });

  describe('UpdateSourceSettingsOutput', () => {
    it('carries sessionId and appliedAt', () => {
      const output: UpdateSourceSettingsOutput = {
        sessionId: SESSION_ID,
        appliedAt: '2026-04-21T00:05:00.000Z',
      };
      expect(output.appliedAt).toBe('2026-04-21T00:05:00.000Z');
    });
  });

  describe('UpdateSourceSettingsInput type shape', () => {
    it('accepts a typed literal', () => {
      const input: UpdateSourceSettingsInput = {
        sessionId: SESSION_ID,
        targetLanguage: 'ja-JP',
      };
      expect(input.targetLanguage).toBe('ja-JP');
    });
  });
});
