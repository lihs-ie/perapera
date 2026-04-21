import { describe, expect, it } from 'vitest';
import { parseClientEvent } from './client-events';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const TIMESTAMP = '2026-04-21T00:00:00.000Z';

const envelope = (eventType: string, payload: unknown, overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    eventType,
    sessionId: SESSION_ID,
    sequence: 1,
    timestamp: TIMESTAMP,
    payload,
    ...overrides,
  });

describe('parseClientEvent', () => {
  it('parses session.start with full payload', () => {
    const raw = envelope('session.start', {
      sourceLanguage: 'en-US',
      autoDetectLanguage: false,
      targetLanguage: 'ja-JP',
      translationEnabled: true,
    });
    const result = parseClientEvent(raw);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.eventType).toBe('session.start');
      if (result.value.eventType === 'session.start') {
        expect(result.value.payload.targetLanguage).toBe('ja-JP');
      }
    }
  });

  it('parses session.start with sourceLanguage=null (auto-detect)', () => {
    const raw = envelope('session.start', {
      sourceLanguage: null,
      autoDetectLanguage: true,
      targetLanguage: 'ja-JP',
      translationEnabled: true,
    });
    expect(parseClientEvent(raw).isOk()).toBe(true);
  });

  it('parses audio.frame with full PCM envelope', () => {
    const raw = envelope('audio.frame', {
      chunkId: 'chk_000001',
      audioBase64: 'AAABAAIAAwAEAAUA',
      encoding: 'pcm_s16le',
      sampleRateHz: 16000,
      channels: 1,
      frameDurationMs: 100,
      capturedAt: TIMESTAMP,
    });
    const result = parseClientEvent(raw);
    expect(result.isOk()).toBe(true);
  });

  it('rejects audio.frame with wrong encoding', () => {
    const raw = envelope('audio.frame', {
      chunkId: 'chk_1',
      audioBase64: 'AAA',
      encoding: 'opus',
      sampleRateHz: 16000,
      channels: 1,
      frameDurationMs: 100,
      capturedAt: TIMESTAMP,
    });
    const result = parseClientEvent(raw);
    expect(result.isErr()).toBe(true);
  });

  it('rejects audio.frame with wrong sampleRate', () => {
    const raw = envelope('audio.frame', {
      chunkId: 'chk_1',
      audioBase64: 'AAA',
      encoding: 'pcm_s16le',
      sampleRateHz: 48000,
      channels: 1,
      frameDurationMs: 100,
      capturedAt: TIMESTAMP,
    });
    expect(parseClientEvent(raw).isErr()).toBe(true);
  });

  it.each(['session.pause', 'session.resume', 'session.stop'] as const)(
    'parses %s with optional reason',
    (type) => {
      const withReason = envelope(type, { reason: 'user-initiated' });
      expect(parseClientEvent(withReason).isOk()).toBe(true);
      const withoutReason = envelope(type, {});
      expect(parseClientEvent(withoutReason).isOk()).toBe(true);
    },
  );

  it('parses session.ping with empty payload', () => {
    const raw = envelope('session.ping', {});
    const result = parseClientEvent(raw);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value.eventType).toBe('session.ping');
  });

  it('rejects session.ping with non-empty payload (strict)', () => {
    const raw = envelope('session.ping', { extra: 'unexpected' });
    expect(parseClientEvent(raw).isErr()).toBe(true);
  });

  it('rejects unknown eventType', () => {
    const raw = envelope('weather.update', { temp: 20 });
    const result = parseClientEvent(raw);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('invariant-violation');
  });

  it('rejects invalid JSON', () => {
    const result = parseClientEvent('{ not json');
    expect(result.isErr()).toBe(true);
    if (result.isErr() && result.error.kind === 'invariant-violation') {
      expect(result.error.invariant).toBe('client-event-invalid-json');
    }
  });

  it('rejects envelope missing sessionId', () => {
    const raw = JSON.stringify({
      eventType: 'session.ping',
      sequence: 1,
      timestamp: TIMESTAMP,
      payload: {},
    });
    expect(parseClientEvent(raw).isErr()).toBe(true);
  });

  it('rejects envelope with non-ISO timestamp', () => {
    const raw = envelope('session.ping', {}, { timestamp: 'yesterday' });
    expect(parseClientEvent(raw).isErr()).toBe(true);
  });
});
