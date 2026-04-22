import { describe, expect, it } from 'vitest';
import { parseOffscreenCommand } from './offscreen-commands';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';

describe('parseOffscreenCommand (IMPL-560)', () => {
  it('parses offscreen.ping', () => {
    const result = parseOffscreenCommand({ type: 'offscreen.ping' });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value.type).toBe('offscreen.ping');
  });

  it('parses offscreen.audio.open with default sampleRate', () => {
    const result = parseOffscreenCommand({
      type: 'offscreen.audio.open',
      sessionIdentifier: SESSION_ID,
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk() && result.value.type === 'offscreen.audio.open') {
      expect(result.value.sessionIdentifier).toBe(SESSION_ID);
      expect(result.value.sampleRateHz).toBeUndefined();
    }
  });

  it('parses offscreen.audio.open with explicit sampleRateHz', () => {
    const result = parseOffscreenCommand({
      type: 'offscreen.audio.open',
      sessionIdentifier: SESSION_ID,
      sampleRateHz: 48000,
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk() && result.value.type === 'offscreen.audio.open') {
      expect(result.value.sampleRateHz).toBe(48000);
    }
  });

  it('parses offscreen.audio.open with tabStreamId (IMPL-610)', () => {
    const result = parseOffscreenCommand({
      type: 'offscreen.audio.open',
      sessionIdentifier: SESSION_ID,
      tabStreamId: 'tab-stream-id-fixture',
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk() && result.value.type === 'offscreen.audio.open') {
      expect(result.value.tabStreamId).toBe('tab-stream-id-fixture');
    }
  });

  it('rejects offscreen.audio.open with empty tabStreamId', () => {
    const result = parseOffscreenCommand({
      type: 'offscreen.audio.open',
      sessionIdentifier: SESSION_ID,
      tabStreamId: '',
    });
    expect(result.isErr()).toBe(true);
  });

  it('parses offscreen.audio.close', () => {
    const result = parseOffscreenCommand({
      type: 'offscreen.audio.close',
      sessionIdentifier: SESSION_ID,
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk() && result.value.type === 'offscreen.audio.close') {
      expect(result.value.sessionIdentifier).toBe(SESSION_ID);
    }
  });

  it('rejects audio.open with malformed sessionIdentifier', () => {
    const result = parseOffscreenCommand({
      type: 'offscreen.audio.open',
      sessionIdentifier: 'not-ulid',
    });
    expect(result.isErr()).toBe(true);
  });

  it('rejects audio.open with negative sampleRate', () => {
    const result = parseOffscreenCommand({
      type: 'offscreen.audio.open',
      sessionIdentifier: SESSION_ID,
      sampleRateHz: -1,
    });
    expect(result.isErr()).toBe(true);
  });

  it('rejects unknown command types', () => {
    const result = parseOffscreenCommand({ type: 'offscreen.unknown' });
    expect(result.isErr()).toBe(true);
  });

  it('rejects non-object payloads', () => {
    expect(parseOffscreenCommand(null).isErr()).toBe(true);
    expect(parseOffscreenCommand(42).isErr()).toBe(true);
  });
});
