import { describe, expect, it } from 'vitest';
import { parseSessionIdentifier } from '../../domain/session/session-identifier';
import type { OverlayRenderModel } from '../ports/overlay-presenter';
import {
  parseHandleTranscriptFinalInput,
  type HandleTranscriptFinalInput,
  type HandleTranscriptFinalOutput,
} from './handle-transcript-final-dto';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const SEGMENT_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7D1';

describe('HandleTranscriptFinalDTO (DD-305)', () => {
  describe('parseHandleTranscriptFinalInput', () => {
    it('accepts a payload without translation', () => {
      const result = parseHandleTranscriptFinalInput({
        sessionId: SESSION_ID,
        segmentId: SEGMENT_ID,
        text: 'hello world',
        timeRange: { startMs: 0, endMs: 1500 },
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value.translation).toBeUndefined();
    });

    it('accepts a payload with completed translation', () => {
      const result = parseHandleTranscriptFinalInput({
        sessionId: SESSION_ID,
        segmentId: SEGMENT_ID,
        text: 'hello',
        timeRange: { startMs: 0, endMs: 1000 },
        translation: {
          targetLanguage: 'ja-JP',
          text: 'こんにちは',
          status: 'completed',
        },
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value.translation?.status).toBe('completed');
    });

    it('accepts a payload with failed translation', () => {
      const result = parseHandleTranscriptFinalInput({
        sessionId: SESSION_ID,
        segmentId: SEGMENT_ID,
        text: 'hello',
        timeRange: { startMs: 0, endMs: 1000 },
        translation: {
          targetLanguage: 'ja-JP',
          text: '',
          status: 'failed',
        },
      });
      expect(result.isOk()).toBe(true);
    });

    it('accepts empty text (translation-only path marker)', () => {
      // session-command-service.toTranslationFinalInput が translation.final
      // RelayEvent 受信時に text='' + translation 付き input を合成する経路
      // (DD-305 §6.2 結果整合性)。Use case 側で text.length === 0 のとき
      // finalizeSegment を skip する前提で、DTO は空 text を受け入れる必要がある。
      const result = parseHandleTranscriptFinalInput({
        sessionId: SESSION_ID,
        segmentId: SEGMENT_ID,
        text: '',
        timeRange: { startMs: 0, endMs: 1000 },
        translation: { targetLanguage: 'ja-JP', text: 'こんにちは', status: 'completed' },
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.text).toBe('');
        expect(result.value.translation?.text).toBe('こんにちは');
      }
    });

    it('rejects unknown translation.status', () => {
      const result = parseHandleTranscriptFinalInput({
        sessionId: SESSION_ID,
        segmentId: SEGMENT_ID,
        text: 'hello',
        timeRange: { startMs: 0, endMs: 1000 },
        translation: {
          targetLanguage: 'ja-JP',
          text: 'こんにちは',
          status: 'pending',
        },
      });
      expect(result.isErr()).toBe(true);
    });

    it('rejects malformed target language BCP-47', () => {
      const result = parseHandleTranscriptFinalInput({
        sessionId: SESSION_ID,
        segmentId: SEGMENT_ID,
        text: 'hello',
        timeRange: { startMs: 0, endMs: 1000 },
        translation: {
          targetLanguage: 'NOT_A_TAG',
          text: 'こんにちは',
          status: 'completed',
        },
      });
      expect(result.isErr()).toBe(true);
    });
  });

  describe('HandleTranscriptFinalOutput type shape', () => {
    it('supports translationStatus values: completed / failed / pending', () => {
      const renderModel: OverlayRenderModel = {
        sessionIdentifier: parseSessionIdentifier(SESSION_ID)._unsafeUnwrap(),
        lines: [],
      };
      const completed: HandleTranscriptFinalOutput = {
        sessionId: SESSION_ID,
        segmentId: SEGMENT_ID,
        translationStatus: 'completed',
        renderModel,
      };
      const failed: HandleTranscriptFinalOutput = {
        ...completed,
        translationStatus: 'failed',
      };
      const pending: HandleTranscriptFinalOutput = {
        ...completed,
        translationStatus: 'pending',
      };
      expect(completed.translationStatus).toBe('completed');
      expect(failed.translationStatus).toBe('failed');
      expect(pending.translationStatus).toBe('pending');
    });
  });

  describe('HandleTranscriptFinalInput type shape', () => {
    it('accepts a typed literal', () => {
      const input: HandleTranscriptFinalInput = {
        sessionId: SESSION_ID,
        segmentId: SEGMENT_ID,
        text: 'hi',
        timeRange: { startMs: 0, endMs: 50 },
      };
      expect(input.segmentId).toBe(SEGMENT_ID);
    });
  });
});
