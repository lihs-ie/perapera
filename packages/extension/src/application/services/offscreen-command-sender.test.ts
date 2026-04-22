import { errAsync, okAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import {
  parseSessionIdentifier,
  type SessionIdentifier,
} from '../../domain/session/session-identifier';
import { invariantViolationError, type DomainError } from '../../domain/shared/errors';
import {
  createOffscreenCommandSender,
  type RuntimeMessageBridge,
} from './offscreen-command-sender';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const identifier: SessionIdentifier = parseSessionIdentifier(SESSION_ID)._unsafeUnwrap();

const buildBridge = (overrides: Partial<RuntimeMessageBridge> = {}): RuntimeMessageBridge => ({
  sendMessage: vi.fn(() => okAsync<void, DomainError>(undefined)),
  ...overrides,
});

describe('createOffscreenCommandSender (IMPL-606)', () => {
  it('sends audio.open with sessionIdentifier (default sampleRateHz omitted)', async () => {
    const bridge = buildBridge();
    const sender = createOffscreenCommandSender({ bridge });

    const result = await sender.openAudioContext(identifier);

    expect(result.isOk()).toBe(true);
    expect(bridge.sendMessage).toHaveBeenCalledWith({
      type: 'offscreen.audio.open',
      sessionIdentifier: SESSION_ID,
    });
  });

  it('passes through optional sampleRateHz when provided', async () => {
    const bridge = buildBridge();
    const sender = createOffscreenCommandSender({ bridge });

    await sender.openAudioContext(identifier, { sampleRateHz: 48000 });

    expect(bridge.sendMessage).toHaveBeenCalledWith({
      type: 'offscreen.audio.open',
      sessionIdentifier: SESSION_ID,
      sampleRateHz: 48000,
    });
  });

  it('passes through optional tabStreamId when provided (IMPL-610)', async () => {
    const bridge = buildBridge();
    const sender = createOffscreenCommandSender({ bridge });

    await sender.openAudioContext(identifier, { tabStreamId: 'tab-stream-id-fixture' });

    expect(bridge.sendMessage).toHaveBeenCalledWith({
      type: 'offscreen.audio.open',
      sessionIdentifier: SESSION_ID,
      tabStreamId: 'tab-stream-id-fixture',
    });
  });

  it('combines sampleRateHz and tabStreamId when both provided', async () => {
    const bridge = buildBridge();
    const sender = createOffscreenCommandSender({ bridge });

    await sender.openAudioContext(identifier, {
      sampleRateHz: 48000,
      tabStreamId: 'tab-stream-id-fixture',
    });

    expect(bridge.sendMessage).toHaveBeenCalledWith({
      type: 'offscreen.audio.open',
      sessionIdentifier: SESSION_ID,
      sampleRateHz: 48000,
      tabStreamId: 'tab-stream-id-fixture',
    });
  });

  it('sends audio.close with sessionIdentifier', async () => {
    const bridge = buildBridge();
    const sender = createOffscreenCommandSender({ bridge });

    const result = await sender.closeAudioContext(identifier);

    expect(result.isOk()).toBe(true);
    expect(bridge.sendMessage).toHaveBeenCalledWith({
      type: 'offscreen.audio.close',
      sessionIdentifier: SESSION_ID,
    });
  });

  it('propagates bridge failure as DomainError', async () => {
    const bridge = buildBridge({
      sendMessage: vi.fn(() =>
        errAsync<void, DomainError>(
          invariantViolationError({ invariant: 'runtime-bridge', details: 'no offscreen' }),
        ),
      ),
    });
    const sender = createOffscreenCommandSender({ bridge });

    const result = await sender.openAudioContext(identifier);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.kind).toBe('invariant-violation');
    }
  });

  it('ping returns ok when bridge succeeds', async () => {
    const bridge = buildBridge();
    const sender = createOffscreenCommandSender({ bridge });

    const result = await sender.ping();

    expect(result.isOk()).toBe(true);
    expect(bridge.sendMessage).toHaveBeenCalledWith({ type: 'offscreen.ping' });
  });
});
