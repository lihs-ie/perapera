import { errAsync, okAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import { createLanguagePair } from '../../domain/session/language-pair';
import {
  parseSessionIdentifier,
  type SessionIdentifier,
} from '../../domain/session/session-identifier';
import { createSourceSession, type SourceSession } from '../../domain/session/source-session';
import { invariantViolationError, type DomainError } from '../../domain/shared/errors';
import { type AudioFrameEnvelope } from './audio-preprocessor';
import { type RelayEvent, type RelayGateway } from './relay-gateway';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const SOURCE_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7B1';
const sessionIdentifier: SessionIdentifier = parseSessionIdentifier(SESSION_ID)._unsafeUnwrap();

const buildSession = (): SourceSession =>
  createSourceSession({
    sessionIdentifier: SESSION_ID,
    sourceIdentifier: SOURCE_ID,
    sourceType: 'tab',
    languagePair: createLanguagePair({ source: 'en-US', target: 'ja-JP' })._unsafeUnwrap(),
    startedAt: '2026-04-21T00:00:00.000Z',
  })._unsafeUnwrap();

const buildFrame = (sequenceNumber: number): AudioFrameEnvelope => ({
  sessionIdentifier,
  sequenceNumber,
  sampleRate: 16000,
  channels: 1,
  pcm16Base64: 'AA==',
  capturedAt: '2026-04-21T00:00:00.000Z',
  durationMs: 100,
});

const okMock: RelayGateway = {
  openSession: () => okAsync(undefined),
  sendAudioFrame: () => okAsync(undefined),
  closeSession: () => okAsync(undefined),
  subscribe: () => () => {
    /* unsubscribe noop */
  },
};

describe('RelayGateway (DD-401)', () => {
  describe('type contract', () => {
    it('accepts an object literal implementing the full interface', () => {
      expect(typeof okMock.openSession).toBe('function');
      expect(typeof okMock.sendAudioFrame).toBe('function');
      expect(typeof okMock.closeSession).toBe('function');
      expect(typeof okMock.subscribe).toBe('function');
    });
  });

  describe('openSession / sendAudioFrame / closeSession', () => {
    it('all resolve to ok(void) on the success path', async () => {
      const o = await okMock.openSession(buildSession());
      const s = await okMock.sendAudioFrame(buildFrame(1));
      const c = await okMock.closeSession(sessionIdentifier);
      expect(o.isOk()).toBe(true);
      expect(s.isOk()).toBe(true);
      expect(c.isOk()).toBe(true);
    });

    it('openSession can return invariantViolationError when Relay WebSocket handshake fails', async () => {
      const mock: RelayGateway = {
        ...okMock,
        openSession: () =>
          errAsync<void, DomainError>(
            invariantViolationError({
              invariant: 'relay-handshake-failed',
              details: 'stream token rejected',
            }),
          ),
      };
      const result = await mock.openSession(buildSession());
      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.kind).toBe('invariant-violation');
    });
  });

  describe('subscribe', () => {
    it('invokes the listener with published RelayEvent instances', () => {
      const listener = vi.fn<(event: RelayEvent) => void>();
      let broadcast: ((event: RelayEvent) => void) | undefined;
      const mock: RelayGateway = {
        ...okMock,
        subscribe: (_, cb) => {
          broadcast = cb;
          return () => {
            broadcast = undefined;
          };
        },
      };
      const unsubscribe = mock.subscribe(sessionIdentifier, listener);
      broadcast?.({
        type: 'session.ready',
        sessionIdentifier,
        heartbeatIntervalSec: 15,
      });
      expect(listener).toHaveBeenCalledTimes(1);
      unsubscribe();
      broadcast?.({
        type: 'session.ready',
        sessionIdentifier,
        heartbeatIntervalSec: 15,
      });
      // After unsubscribe, the mock clears broadcast so further events should not invoke listener.
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('RelayEvent discriminated union', () => {
    it('narrows payload via the type discriminator', () => {
      const events: RelayEvent[] = [
        { type: 'session.ready', sessionIdentifier, heartbeatIntervalSec: 15 },
        {
          type: 'transcript.partial',
          sessionIdentifier,
          segmentIdentifier: 'seg-1',
          revision: 1,
          text: 'hello',
        },
        {
          type: 'transcript.final',
          sessionIdentifier,
          segmentIdentifier: 'seg-1',
          text: 'hello',
          finalizedAt: '2026-04-21T00:00:05.000Z',
        },
        {
          type: 'translation.final',
          sessionIdentifier,
          segmentIdentifier: 'seg-1',
          translationIdentifier: 'tr-1',
          targetLanguage: 'ja-JP',
          text: 'こんにちは',
        },
        {
          type: 'session.error',
          sessionIdentifier,
          code: 'TRANSLATION_TIMEOUT',
          message: 'translation timed out',
          retryable: true,
          fatal: false,
        },
      ];
      for (const event of events) {
        if (event.type === 'transcript.partial') {
          expect(event.revision).toBe(1);
        } else if (event.type === 'session.error') {
          expect(event.retryable).toBe(true);
          expect(event.fatal).toBe(false);
        }
      }
    });
  });
});
