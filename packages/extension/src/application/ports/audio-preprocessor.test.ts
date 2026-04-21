import { okAsync } from 'neverthrow';
import { describe, expect, it } from 'vitest';
import {
  parseSessionIdentifier,
  type SessionIdentifier,
} from '../../domain/session/session-identifier';
import {
  type AudioFrameChannel,
  type AudioFrameEnvelope,
  type AudioPreprocessor,
} from './audio-preprocessor';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const sessionIdentifier: SessionIdentifier = parseSessionIdentifier(SESSION_ID)._unsafeUnwrap();

const emptyChannel = (): AudioFrameChannel => ({
  frames: {
    [Symbol.asyncIterator]: () => ({
      next: () => Promise.resolve({ done: true, value: undefined }),
    }),
  },
  close: () => {
    /* noop */
  },
});

const frameEnvelope = (sequenceNumber: number): AudioFrameEnvelope => ({
  sessionIdentifier,
  sequenceNumber,
  sampleRate: 16000,
  channels: 1,
  pcm16Base64: 'AA==',
  capturedAt: '2026-04-21T00:00:00.000Z',
  durationMs: 100,
});

describe('AudioPreprocessor (DD-104)', () => {
  describe('type contract', () => {
    it('accepts an object literal that implements attach and detach', () => {
      const mock: AudioPreprocessor = {
        attach: () => okAsync(emptyChannel()),
        detach: () => okAsync(undefined),
      };
      expect(typeof mock.attach).toBe('function');
      expect(typeof mock.detach).toBe('function');
    });
  });

  describe('AudioFrameEnvelope shape', () => {
    it('conforms to the expected PCM 16kHz mono 100ms payload contract', () => {
      const envelope = frameEnvelope(1);
      expect(envelope.sampleRate).toBe(16000);
      expect(envelope.channels).toBe(1);
      expect(envelope.durationMs).toBe(100);
      expect(typeof envelope.pcm16Base64).toBe('string');
      expect(envelope.sequenceNumber).toBe(1);
    });
  });

  describe('AudioFrameChannel', () => {
    it('frames is an AsyncIterable and yields AudioFrameEnvelope values', async () => {
      const channel: AudioFrameChannel = {
        frames: (async function* () {
          await Promise.resolve();
          yield frameEnvelope(1);
          yield frameEnvelope(2);
        })(),
        close: () => {
          /* noop */
        },
      };
      const collected: AudioFrameEnvelope[] = [];
      for await (const frame of channel.frames) {
        collected.push(frame);
      }
      expect(collected).toHaveLength(2);
      expect(collected[0]?.sequenceNumber).toBe(1);
      expect(collected[1]?.sequenceNumber).toBe(2);
    });
  });

  describe('detach', () => {
    it('resolves to ok(void) on the success path', async () => {
      const mock: AudioPreprocessor = {
        attach: () => okAsync(emptyChannel()),
        detach: () => okAsync(undefined),
      };
      const result = await mock.detach(sessionIdentifier);
      expect(result.isOk()).toBe(true);
    });
  });
});
