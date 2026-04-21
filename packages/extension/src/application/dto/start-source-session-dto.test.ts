import { describe, expect, it } from 'vitest';
import {
  parseStartSourceSessionInput,
  type StartSourceSessionInput,
  type StartSourceSessionOutput,
} from './start-source-session-dto';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';

describe('StartSourceSessionDTO (DD-301)', () => {
  describe('parseStartSourceSessionInput', () => {
    it('accepts a tab source with overlayTarget=tab', () => {
      const result = parseStartSourceSessionInput({
        sourceType: 'tab',
        displayName: 'Example tab',
        sourceLanguage: 'en-US',
        autoDetectLanguage: false,
        targetLanguage: 'ja-JP',
        overlayTarget: { kind: 'tab', tabId: 42 },
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.sourceType).toBe('tab');
        expect(result.value.overlayTarget.kind).toBe('tab');
      }
    });

    it('accepts a microphone source with extension-monitor overlay', () => {
      const result = parseStartSourceSessionInput({
        sourceType: 'microphone',
        displayName: 'Built-in mic',
        sourceLanguage: null,
        autoDetectLanguage: true,
        targetLanguage: 'ja-JP',
        overlayTarget: { kind: 'extension-monitor', pageId: 'monitor-1' },
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.sourceLanguage).toBeNull();
        expect(result.value.autoDetectLanguage).toBe(true);
      }
    });

    it('accepts a desktop source with minimal overlayTarget', () => {
      const result = parseStartSourceSessionInput({
        sourceType: 'desktop',
        displayName: 'Screen share',
        autoDetectLanguage: false,
        targetLanguage: 'ja-JP',
        overlayTarget: { kind: 'extension-monitor' },
      });
      expect(result.isOk()).toBe(true);
    });

    it('rejects unknown sourceType', () => {
      const result = parseStartSourceSessionInput({
        sourceType: 'webcam',
        displayName: 'bad',
        autoDetectLanguage: false,
        targetLanguage: 'ja-JP',
        overlayTarget: { kind: 'tab' },
      });
      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.kind).toBe('validation');
    });

    it('rejects empty displayName', () => {
      const result = parseStartSourceSessionInput({
        sourceType: 'tab',
        displayName: '',
        autoDetectLanguage: false,
        targetLanguage: 'ja-JP',
        overlayTarget: { kind: 'tab' },
      });
      expect(result.isErr()).toBe(true);
    });

    it('rejects malformed BCP-47 target language', () => {
      const result = parseStartSourceSessionInput({
        sourceType: 'tab',
        displayName: 'tab',
        autoDetectLanguage: false,
        targetLanguage: 'NOT_A_TAG',
        overlayTarget: { kind: 'tab' },
      });
      expect(result.isErr()).toBe(true);
    });

    it('rejects unknown overlayTarget.kind', () => {
      const result = parseStartSourceSessionInput({
        sourceType: 'tab',
        displayName: 'tab',
        autoDetectLanguage: false,
        targetLanguage: 'ja-JP',
        overlayTarget: { kind: 'sidebar' },
      });
      expect(result.isErr()).toBe(true);
    });
  });

  describe('StartSourceSessionOutput type shape', () => {
    it('carries sessionId, state, and startedAt', () => {
      const output: StartSourceSessionOutput = {
        sessionId: SESSION_ID,
        state: 'requesting_permission',
        startedAt: '2026-04-21T00:00:00.000Z',
      };
      expect(output.state).toBe('requesting_permission');
    });
  });

  describe('StartSourceSessionInput type shape', () => {
    it('accepts a typed literal', () => {
      const input: StartSourceSessionInput = {
        sourceType: 'tab',
        displayName: 'Tab',
        autoDetectLanguage: false,
        targetLanguage: 'ja-JP',
        overlayTarget: { kind: 'tab' },
      };
      expect(input.sourceType).toBe('tab');
    });
  });
});
