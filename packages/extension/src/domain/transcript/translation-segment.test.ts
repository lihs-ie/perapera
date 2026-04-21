import { describe, expect, it } from 'vitest';
import {
  createCompletedTranslationSegment,
  createFailedTranslationSegment,
} from './translation-segment.js';

const VALID_ULID_A = '01HZX8Y1R8M7D3Q2P4T5V6W7X8';
const VALID_ULID_B = '01HZX8Y1R8M7D3Q2P4T5V6W7X9';

describe('TranslationSegment', () => {
  describe('createCompletedTranslationSegment', () => {
    it('creates a completed translation segment', () => {
      const result = createCompletedTranslationSegment({
        translationIdentifier: VALID_ULID_A,
        segmentIdentifier: VALID_ULID_B,
        targetLanguage: 'ja-JP',
        text: 'こんにちは',
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.status).toBe('completed');
        if (result.value.status === 'completed') {
          expect(result.value.text).toBe('こんにちは');
        }
      }
    });

    it('rejects empty text', () => {
      const result = createCompletedTranslationSegment({
        translationIdentifier: VALID_ULID_A,
        segmentIdentifier: VALID_ULID_B,
        targetLanguage: 'ja-JP',
        text: '',
      });
      expect(result.isErr()).toBe(true);
    });

    it('rejects invalid targetLanguage (BCP-47)', () => {
      const result = createCompletedTranslationSegment({
        translationIdentifier: VALID_ULID_A,
        segmentIdentifier: VALID_ULID_B,
        targetLanguage: 'NOT_A_LANG',
        text: 'x',
      });
      expect(result.isErr()).toBe(true);
    });

    it('rejects invalid identifiers', () => {
      expect(
        createCompletedTranslationSegment({
          translationIdentifier: 'not-ulid',
          segmentIdentifier: VALID_ULID_B,
          targetLanguage: 'ja-JP',
          text: 'x',
        }).isErr(),
      ).toBe(true);
      expect(
        createCompletedTranslationSegment({
          translationIdentifier: VALID_ULID_A,
          segmentIdentifier: 'bad',
          targetLanguage: 'ja-JP',
          text: 'x',
        }).isErr(),
      ).toBe(true);
    });
  });

  describe('createFailedTranslationSegment', () => {
    it('creates a failed translation segment without text', () => {
      const result = createFailedTranslationSegment({
        translationIdentifier: VALID_ULID_A,
        segmentIdentifier: VALID_ULID_B,
        targetLanguage: 'ja-JP',
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.status).toBe('failed');
      }
    });
  });
});
