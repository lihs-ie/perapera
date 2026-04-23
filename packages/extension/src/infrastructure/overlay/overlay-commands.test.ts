import { describe, expect, it } from 'vitest';
import { parseOverlayCommand } from './overlay-commands';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const SEGMENT_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A2';

describe('parseOverlayCommand (IMPL-554)', () => {
  describe('overlay.mount', () => {
    it('parses a valid mount command', () => {
      const result = parseOverlayCommand({
        type: 'overlay.mount',
        sessionIdentifier: SESSION_ID,
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.type).toBe('overlay.mount');
        if (result.value.type === 'overlay.mount') {
          expect(result.value.sessionIdentifier).toBe(SESSION_ID);
        }
      }
    });

    it('rejects mount with missing sessionIdentifier', () => {
      const result = parseOverlayCommand({ type: 'overlay.mount' });
      expect(result.isErr()).toBe(true);
    });

    it('rejects mount with malformed sessionIdentifier', () => {
      const result = parseOverlayCommand({
        type: 'overlay.mount',
        sessionIdentifier: 'not-a-ulid',
      });
      expect(result.isErr()).toBe(true);
    });
  });

  describe('overlay.render', () => {
    it('parses a valid render command with original and translated lines', () => {
      const result = parseOverlayCommand({
        type: 'overlay.render',
        model: {
          sessionIdentifier: SESSION_ID,
          lines: [
            {
              segmentIdentifier: SEGMENT_ID,
              originalText: 'Hello',
              translatedText: 'こんにちは',
              targetLanguage: 'ja',
              isFinal: true,
            },
          ],
        },
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk() && result.value.type === 'overlay.render') {
        expect(result.value.model.lines).toHaveLength(1);
        const line = result.value.model.lines[0];
        expect(line?.originalText).toBe('Hello');
        expect(line?.translatedText).toBe('こんにちは');
        expect(line?.isFinal).toBe(true);
      }
    });

    it('accepts nullable originalText / translatedText / targetLanguage', () => {
      const result = parseOverlayCommand({
        type: 'overlay.render',
        model: {
          sessionIdentifier: SESSION_ID,
          lines: [
            {
              segmentIdentifier: SEGMENT_ID,
              originalText: null,
              translatedText: 'こんにちは',
              targetLanguage: null,
              isFinal: false,
            },
          ],
        },
      });
      expect(result.isOk()).toBe(true);
    });

    it('accepts empty lines array', () => {
      const result = parseOverlayCommand({
        type: 'overlay.render',
        model: { sessionIdentifier: SESSION_ID, lines: [] },
      });
      expect(result.isOk()).toBe(true);
    });

    it('rejects render with malformed segmentIdentifier', () => {
      const result = parseOverlayCommand({
        type: 'overlay.render',
        model: {
          sessionIdentifier: SESSION_ID,
          lines: [
            {
              segmentIdentifier: 'invalid',
              originalText: null,
              translatedText: null,
              targetLanguage: null,
              isFinal: true,
            },
          ],
        },
      });
      expect(result.isErr()).toBe(true);
    });
  });

  describe('overlay.update-settings', () => {
    it('parses a valid update-settings command', () => {
      const result = parseOverlayCommand({
        type: 'overlay.update-settings',
        sessionIdentifier: SESSION_ID,
        settings: {
          positionPreset: 'bottom',
          opacity: 0.8,
          maxLines: 3,
          fontScale: 1,
          showOriginalText: true,
          showTranslatedText: true,
        },
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk() && result.value.type === 'overlay.update-settings') {
        expect(result.value.settings.opacity).toBe(0.8);
      }
    });

    it('rejects update-settings with out-of-range opacity', () => {
      const result = parseOverlayCommand({
        type: 'overlay.update-settings',
        sessionIdentifier: SESSION_ID,
        settings: {
          positionPreset: 'bottom',
          opacity: 1.5,
          maxLines: 3,
          fontScale: 1,
          showOriginalText: true,
          showTranslatedText: true,
        },
      });
      expect(result.isErr()).toBe(true);
    });

    it('rejects update-settings when both show flags are false (domain invariant)', () => {
      const result = parseOverlayCommand({
        type: 'overlay.update-settings',
        sessionIdentifier: SESSION_ID,
        settings: {
          positionPreset: 'bottom',
          opacity: 1,
          maxLines: 1,
          fontScale: 1,
          showOriginalText: false,
          showTranslatedText: false,
        },
      });
      expect(result.isErr()).toBe(true);
    });
  });

  describe('overlay.unmount', () => {
    it('parses a valid unmount command', () => {
      const result = parseOverlayCommand({
        type: 'overlay.unmount',
        sessionIdentifier: SESSION_ID,
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk() && result.value.type === 'overlay.unmount') {
        expect(result.value.sessionIdentifier).toBe(SESSION_ID);
      }
    });
  });

  describe('unknown / malformed', () => {
    it('rejects arbitrary non-OverlayCommand messages (e.g., BackgroundRequest)', () => {
      const result = parseOverlayCommand({
        type: 'command.start-source-session',
        input: {},
      });
      expect(result.isErr()).toBe(true);
    });

    it('rejects non-object payloads', () => {
      expect(parseOverlayCommand(null).isErr()).toBe(true);
      expect(parseOverlayCommand(42).isErr()).toBe(true);
      expect(parseOverlayCommand('text').isErr()).toBe(true);
    });
  });
});
