import { describe, expect, it } from 'vitest';
import {
  buildSessionError,
  buildSessionPong,
  buildSessionReady,
  serializeServerEvent,
} from './server-events';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const TIMESTAMP = '2026-04-21T00:00:00.000Z';

describe('server event builders', () => {
  it('buildSessionReady includes state + heartbeatIntervalSec + acceptedAudio per spec §6.3', () => {
    const event = buildSessionReady({
      sessionId: SESSION_ID,
      sequence: 0,
      timestamp: TIMESTAMP,
      heartbeatIntervalSec: 15,
    });
    expect(event).toEqual({
      eventType: 'session.ready',
      sessionId: SESSION_ID,
      sequence: 0,
      timestamp: TIMESTAMP,
      payload: {
        state: 'capturing',
        heartbeatIntervalSec: 15,
        acceptedAudio: {
          transport: 'json-base64',
          sampleRateHz: 16000,
          channels: 1,
          frameDurationMs: 100,
        },
      },
    });
  });

  it('buildSessionPong has empty payload', () => {
    const event = buildSessionPong({
      sessionId: SESSION_ID,
      sequence: 5,
      timestamp: TIMESTAMP,
    });
    expect(event.eventType).toBe('session.pong');
    expect(event.payload).toEqual({});
  });

  it('buildSessionError carries code / message / retryable / fatal', () => {
    const event = buildSessionError({
      sessionId: SESSION_ID,
      sequence: 7,
      timestamp: TIMESTAMP,
      code: 'VALIDATION_ERROR',
      message: 'bad payload',
      retryable: false,
      fatal: false,
    });
    expect(event.payload).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'bad payload',
      retryable: false,
      fatal: false,
    });
  });

  it('serializeServerEvent produces parseable JSON', () => {
    const event = buildSessionPong({
      sessionId: SESSION_ID,
      sequence: 1,
      timestamp: TIMESTAMP,
    });
    const parsed: unknown = JSON.parse(serializeServerEvent(event));
    expect(parsed).toEqual(event);
  });
});
