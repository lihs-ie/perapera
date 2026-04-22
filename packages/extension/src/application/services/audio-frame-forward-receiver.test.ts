import { errAsync, okAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import { invariantViolationError, type DomainError } from '../../domain/shared/errors';
import { type RelayGateway } from '../ports/relay-gateway';
import {
  createAudioFrameForwardReceiver,
  tryParseAudioFrameForwardMessage,
} from './audio-frame-forward-receiver';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';

const buildFrameMessage = (overrides: Record<string, unknown> = {}): unknown => ({
  type: 'audio.frame.forward',
  sessionIdentifier: SESSION_ID,
  data: {
    type: 'audio.frame',
    sequenceNumber: 1,
    sampleRate: 16000,
    channels: 1,
    pcm16Base64: 'AAAA',
    capturedAt: '2026-04-22T00:00:00.100Z',
    durationMs: 100,
    ...overrides,
  },
});

const buildGateway = (overrides: Partial<RelayGateway> = {}): RelayGateway => ({
  openSession: vi.fn(() => okAsync(undefined)),
  sendAudioFrame: vi.fn<RelayGateway['sendAudioFrame']>(() => okAsync(undefined)),
  closeSession: vi.fn(() => okAsync(undefined)),
  subscribe: vi.fn(() => () => {
    /* noop */
  }),
  ...overrides,
});

describe('tryParseAudioFrameForwardMessage (IMPL-618)', () => {
  it('parses a valid audio.frame.forward payload', () => {
    const result = tryParseAudioFrameForwardMessage(buildFrameMessage());
    expect(result).not.toBeNull();
    expect(result?.envelope.sequenceNumber).toBe(1);
    expect(result?.envelope.pcm16Base64).toBe('AAAA');
  });

  it('returns null for non-matching type', () => {
    expect(tryParseAudioFrameForwardMessage({ type: 'offscreen.ping' })).toBeNull();
  });

  it('returns null for non-object message', () => {
    expect(tryParseAudioFrameForwardMessage(null)).toBeNull();
    expect(tryParseAudioFrameForwardMessage(42)).toBeNull();
    expect(tryParseAudioFrameForwardMessage('audio.frame.forward')).toBeNull();
  });

  it('returns null when sessionIdentifier is malformed (not ULID)', () => {
    const result = tryParseAudioFrameForwardMessage({
      type: 'audio.frame.forward',
      sessionIdentifier: 'not-ulid',
      data: {
        type: 'audio.frame',
        sequenceNumber: 1,
        sampleRate: 16000,
        channels: 1,
        pcm16Base64: 'AAAA',
        capturedAt: '2026-04-22T00:00:00.100Z',
        durationMs: 100,
      },
    });
    expect(result).toBeNull();
  });

  it('returns null when required fields are missing', () => {
    const partial: Record<string, unknown> = {
      type: 'audio.frame.forward',
      sessionIdentifier: SESSION_ID,
      // data 欠落
    };
    expect(tryParseAudioFrameForwardMessage(partial)).toBeNull();
  });

  it('returns null when pcm16Base64 is empty string', () => {
    expect(tryParseAudioFrameForwardMessage(buildFrameMessage({ pcm16Base64: '' }))).toBeNull();
  });
});

describe('createAudioFrameForwardReceiver (IMPL-618)', () => {
  it('forwards valid frame to relayGateway.sendAudioFrame', async () => {
    const relayGateway = buildGateway();
    const receiver = createAudioFrameForwardReceiver({ relayGateway });

    const result = await receiver.receive(buildFrameMessage());

    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value).toBe('forwarded');
    expect(relayGateway.sendAudioFrame).toHaveBeenCalledTimes(1);
    const envelope = vi.mocked(relayGateway.sendAudioFrame).mock.calls[0]?.[0];
    expect(envelope?.sessionIdentifier).toBe(SESSION_ID);
    expect(envelope?.pcm16Base64).toBe('AAAA');
  });

  it('returns "ignored" for non-matching message types (silent ignore)', async () => {
    const relayGateway = buildGateway();
    const receiver = createAudioFrameForwardReceiver({ relayGateway });

    const result = await receiver.receive({ type: 'offscreen.ping' });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value).toBe('ignored');
    expect(relayGateway.sendAudioFrame).not.toHaveBeenCalled();
  });

  it('logs warn and propagates Err when sendAudioFrame fails', async () => {
    const logWarn = vi.fn();
    const relayGateway = buildGateway({
      sendAudioFrame: vi.fn(() =>
        errAsync<void, DomainError>(
          invariantViolationError({ invariant: 'relay-send-failed', details: 'socket closed' }),
        ),
      ),
    });
    const receiver = createAudioFrameForwardReceiver({ relayGateway, logWarn });

    const result = await receiver.receive(buildFrameMessage());

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('invariant-violation');
    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('invariant-violation'));
  });

  it('returns "ignored" for malformed messages without calling sendAudioFrame', async () => {
    const relayGateway = buildGateway();
    const receiver = createAudioFrameForwardReceiver({ relayGateway });

    const malformed: unknown = { type: 'audio.frame.forward', sessionIdentifier: 'bad' };
    const result = await receiver.receive(malformed);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value).toBe('ignored');
    expect(relayGateway.sendAudioFrame).not.toHaveBeenCalled();
  });
});
