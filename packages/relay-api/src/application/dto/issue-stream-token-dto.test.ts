import { describe, expect, it } from 'vitest';
import { parseIssueStreamTokenInput } from './issue-stream-token-dto';

const baseInput = (overrides: Record<string, unknown> = {}) => ({
  sourceType: 'tab',
  displayName: 'YouTube Live',
  sourceLanguage: 'en-US',
  autoDetectLanguage: false,
  targetLanguage: 'ja-JP',
  overlayTarget: { kind: 'tab', tabId: 42 },
  client: { extensionVersion: '0.1.0', protocolVersion: '1.0' },
  ...overrides,
});

describe('parseIssueStreamTokenInput', () => {
  it('accepts a valid tab input', () => {
    const result = parseIssueStreamTokenInput(baseInput());
    expect(result.isOk()).toBe(true);
  });

  it('accepts extension-monitor overlayTarget', () => {
    const result = parseIssueStreamTokenInput(
      baseInput({ overlayTarget: { kind: 'extension-monitor', pageId: 'monitor-1' } }),
    );
    expect(result.isOk()).toBe(true);
  });

  it('accepts sourceLanguage=null', () => {
    const result = parseIssueStreamTokenInput(
      baseInput({ sourceLanguage: null, autoDetectLanguage: true }),
    );
    expect(result.isOk()).toBe(true);
  });

  it('rejects unknown sourceType', () => {
    const result = parseIssueStreamTokenInput(baseInput({ sourceType: 'webcam' }));
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('validation');
  });

  it('rejects empty displayName', () => {
    const result = parseIssueStreamTokenInput(baseInput({ displayName: '' }));
    expect(result.isErr()).toBe(true);
  });

  it('rejects overlayTarget kind=tab without tabId', () => {
    const result = parseIssueStreamTokenInput(baseInput({ overlayTarget: { kind: 'tab' } }));
    expect(result.isErr()).toBe(true);
  });

  it('rejects client without extensionVersion', () => {
    const result = parseIssueStreamTokenInput(baseInput({ client: { protocolVersion: '1.0' } }));
    expect(result.isErr()).toBe(true);
  });

  it('rejects non-boolean autoDetectLanguage', () => {
    const result = parseIssueStreamTokenInput(baseInput({ autoDetectLanguage: 'yes' }));
    expect(result.isErr()).toBe(true);
  });
});
