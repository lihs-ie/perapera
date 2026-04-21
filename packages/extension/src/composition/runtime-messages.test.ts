import { describe, expect, it } from 'vitest';
import { parseBackgroundRequest } from './runtime-messages';

describe('parseBackgroundRequest (IMPL-501)', () => {
  it('parses a start-source-session command', () => {
    const result = parseBackgroundRequest({
      type: 'command.start-source-session',
      input: {
        sourceType: 'tab',
        displayName: 'YouTube Live',
        sourceLanguage: 'en-US',
        autoDetectLanguage: false,
        targetLanguage: 'ja-JP',
        overlayTarget: { kind: 'tab', tabId: 42 },
      },
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk() && result.value.type === 'command.start-source-session') {
      expect(result.value.input.sourceType).toBe('tab');
      expect(result.value.input.overlayTarget.kind).toBe('tab');
    }
  });

  it('parses a stop-source-session command', () => {
    const result = parseBackgroundRequest({
      type: 'command.stop-source-session',
      input: { sessionId: '01HZX8Y1R8M7D3Q2P4T5V6W7A1' },
    });
    expect(result.isOk()).toBe(true);
  });

  it('parses an update-source-settings command with overlaySettings', () => {
    const result = parseBackgroundRequest({
      type: 'command.update-source-settings',
      input: {
        sessionId: '01HZX8Y1R8M7D3Q2P4T5V6W7A1',
        overlaySettings: {
          positionPreset: 'bottom',
          opacity: 0.8,
          maxLines: 2,
          fontScale: 1,
          showOriginalText: true,
          showTranslatedText: true,
        },
      },
    });
    expect(result.isOk()).toBe(true);
  });

  it('parses an export-session-result command', () => {
    const result = parseBackgroundRequest({
      type: 'command.export-session-result',
      input: {
        sessionId: '01HZX8Y1R8M7D3Q2P4T5V6W7A1',
        format: 'json',
        includeOriginal: true,
        includeTranslation: false,
      },
    });
    expect(result.isOk()).toBe(true);
  });

  it('parses a get-session-monitor-state query', () => {
    const result = parseBackgroundRequest({
      type: 'query.get-session-monitor-state',
      input: {
        includeOverlayState: true,
        sessionIds: ['01HZX8Y1R8M7D3Q2P4T5V6W7A1'],
      },
    });
    expect(result.isOk()).toBe(true);
  });

  it('rejects an unknown type', () => {
    const result = parseBackgroundRequest({ type: 'command.unknown', input: {} });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('validation');
  });

  it('rejects malformed overlayTarget kind', () => {
    const result = parseBackgroundRequest({
      type: 'command.start-source-session',
      input: {
        sourceType: 'tab',
        displayName: 'x',
        autoDetectLanguage: false,
        targetLanguage: 'ja-JP',
        overlayTarget: { kind: 'bad-value' },
      },
    });
    expect(result.isErr()).toBe(true);
  });

  it('rejects invalid BCP-47 language code', () => {
    const result = parseBackgroundRequest({
      type: 'command.start-source-session',
      input: {
        sourceType: 'tab',
        displayName: 'x',
        autoDetectLanguage: false,
        targetLanguage: 'invalid_code',
        overlayTarget: { kind: 'tab', tabId: 42 },
      },
    });
    expect(result.isErr()).toBe(true);
  });

  it('rejects when top-level `type` is missing', () => {
    const result = parseBackgroundRequest({ input: {} });
    expect(result.isErr()).toBe(true);
  });
});
