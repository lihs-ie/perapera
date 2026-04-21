import { describe, expect, it } from 'vitest';
import {
  parseSessionIdentifier,
  type SessionIdentifier,
} from '../../domain/session/session-identifier';
import { parseRelayServerMessage } from './relay-event-mapper';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const sessionIdentifier: SessionIdentifier = parseSessionIdentifier(SESSION_ID)._unsafeUnwrap();

const wrap = (eventType: string, payload: Record<string, unknown>): string =>
  JSON.stringify({
    eventType,
    sessionId: SESSION_ID,
    sequence: 1,
    timestamp: '2026-04-21T00:00:00.000Z',
    payload,
  });

describe('parseRelayServerMessage (IMPL-321, DD-411)', () => {
  it('parses session.ready', () => {
    const raw = wrap('session.ready', {
      state: 'capturing',
      heartbeatIntervalSec: 15,
      streamToken: 'tkn_xxx',
    });
    const result = parseRelayServerMessage(raw);
    expect(result.isOk()).toBe(true);
    if (result.isOk() && result.value !== null) {
      expect(result.value.type).toBe('session.ready');
      if (result.value.type === 'session.ready') {
        expect(result.value.streamToken).toBe('tkn_xxx');
        expect(result.value.sessionIdentifier).toBe(sessionIdentifier);
      }
    }
  });

  it('parses transcript.partial', () => {
    const raw = wrap('transcript.partial', {
      segmentId: '01HZX8Y1R8M7D3Q2P4T5V6W7D1',
      revision: 2,
      text: 'hello world',
      language: 'en-US',
      startOffsetMs: 0,
      endOffsetMs: 1500,
    });
    const result = parseRelayServerMessage(raw);
    expect(result.isOk()).toBe(true);
    if (result.isOk() && result.value !== null && result.value.type === 'transcript.partial') {
      expect(result.value.segmentIdentifier).toBe('01HZX8Y1R8M7D3Q2P4T5V6W7D1');
      expect(result.value.revision).toBe(2);
      expect(result.value.text).toBe('hello world');
    }
  });

  it('parses transcript.final', () => {
    const raw = wrap('transcript.final', {
      segmentId: '01HZX8Y1R8M7D3Q2P4T5V6W7D1',
      text: 'hello',
      finalizedAt: '2026-04-21T00:00:05.000Z',
    });
    const result = parseRelayServerMessage(raw);
    expect(result.isOk()).toBe(true);
    if (result.isOk() && result.value !== null && result.value.type === 'transcript.final') {
      expect(result.value.segmentIdentifier).toBe('01HZX8Y1R8M7D3Q2P4T5V6W7D1');
      expect(result.value.finalizedAt).toBe('2026-04-21T00:00:05.000Z');
    }
  });

  it('parses translation.final', () => {
    const raw = wrap('translation.final', {
      translationId: '01HZX8Y1R8M7D3Q2P4T5V6W7E1',
      sourceSegmentId: '01HZX8Y1R8M7D3Q2P4T5V6W7D1',
      text: 'こんにちは',
      targetLanguage: 'ja-JP',
    });
    const result = parseRelayServerMessage(raw);
    expect(result.isOk()).toBe(true);
    if (result.isOk() && result.value !== null && result.value.type === 'translation.final') {
      expect(result.value.translationIdentifier).toBe('01HZX8Y1R8M7D3Q2P4T5V6W7E1');
      expect(result.value.targetLanguage).toBe('ja-JP');
      expect(result.value.text).toBe('こんにちは');
    }
  });

  it('parses session.state.changed', () => {
    const raw = wrap('session.state.changed', {
      currentState: 'reconnecting',
    });
    const result = parseRelayServerMessage(raw);
    expect(result.isOk()).toBe(true);
    if (result.isOk() && result.value !== null && result.value.type === 'session.state.changed') {
      expect(result.value.state).toBe('reconnecting');
    }
  });

  it('parses session.error with retryable/fatal flags', () => {
    const raw = wrap('session.error', {
      code: 'TRANSLATION_TIMEOUT',
      message: 'translation provider timed out',
      retryable: true,
      fatal: false,
    });
    const result = parseRelayServerMessage(raw);
    expect(result.isOk()).toBe(true);
    if (result.isOk() && result.value !== null && result.value.type === 'session.error') {
      expect(result.value.code).toBe('TRANSLATION_TIMEOUT');
      expect(result.value.retryable).toBe(true);
      expect(result.value.fatal).toBe(false);
    }
  });

  it('returns null for session.pong (heartbeat — not a domain event)', () => {
    const raw = wrap('session.pong', {});
    const result = parseRelayServerMessage(raw);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value).toBeNull();
  });

  it('returns validation error for unknown eventType', () => {
    const raw = wrap('session.unknown', {});
    const result = parseRelayServerMessage(raw);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('validation');
  });

  it('returns validation error for malformed JSON', () => {
    const result = parseRelayServerMessage('not-json{');
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('validation');
  });

  it('returns validation error for missing required fields', () => {
    const result = parseRelayServerMessage(JSON.stringify({ eventType: 'transcript.partial' }));
    expect(result.isErr()).toBe(true);
  });

  it('returns validation error for invalid sessionId format', () => {
    const raw = JSON.stringify({
      eventType: 'session.ready',
      sessionId: 'not-a-ulid',
      sequence: 0,
      timestamp: '2026-04-21T00:00:00.000Z',
      payload: { state: 'capturing', heartbeatIntervalSec: 15, streamToken: 'x' },
    });
    const result = parseRelayServerMessage(raw);
    expect(result.isErr()).toBe(true);
  });
});
