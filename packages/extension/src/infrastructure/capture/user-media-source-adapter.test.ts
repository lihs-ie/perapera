import { describe, expect, it, vi } from 'vitest';
import {
  parseSessionIdentifier,
  type SessionIdentifier,
} from '../../domain/session/session-identifier';
import { type StartSourceCommand } from '../../application/ports/source-adapter';
import { addFakeTrack } from '../../../tests/helpers/media-stream';
import { createUserMediaSourceAdapter, type UserMediaApi } from './user-media-source-adapter';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const sessionIdentifier: SessionIdentifier = parseSessionIdentifier(SESSION_ID)._unsafeUnwrap();

const buildCommand = (overrides: Partial<StartSourceCommand> = {}): StartSourceCommand => ({
  sourceType: 'microphone',
  sessionIdentifier,
  deviceId: 'default',
  ...overrides,
});

const buildApi = (): UserMediaApi & {
  getUserMedia: ReturnType<typeof vi.fn<UserMediaApi['getUserMedia']>>;
} => {
  const stream = new MediaStream();
  const getUserMedia = vi.fn<UserMediaApi['getUserMedia']>(() => Promise.resolve(stream));
  return { getUserMedia };
};

describe('createUserMediaSourceAdapter (IMPL-301, DD-102)', () => {
  it('returns MediaStream from getUserMedia on open', async () => {
    const api = buildApi();
    const adapter = createUserMediaSourceAdapter({ userMediaApi: api });
    const result = await adapter.open(buildCommand());
    expect(result.isOk()).toBe(true);
    expect(api.getUserMedia).toHaveBeenCalledTimes(1);
    if (result.isOk()) {
      expect(result.value).toBeInstanceOf(MediaStream);
    }
  });

  it('passes deviceId through audio constraints', async () => {
    const api = buildApi();
    const adapter = createUserMediaSourceAdapter({ userMediaApi: api });
    await adapter.open(buildCommand({ deviceId: 'mic-123' }));
    expect(api.getUserMedia).toHaveBeenCalledWith({
      audio: { deviceId: { exact: 'mic-123' } },
      video: false,
    });
  });

  it('falls back to audio: true when deviceId is omitted', async () => {
    const api = buildApi();
    const adapter = createUserMediaSourceAdapter({ userMediaApi: api });
    await adapter.open({ sourceType: 'microphone', sessionIdentifier });
    expect(api.getUserMedia).toHaveBeenCalledWith({ audio: true, video: false });
  });

  it('returns invariant-violation when getUserMedia rejects', async () => {
    const api: UserMediaApi = {
      getUserMedia: () => Promise.reject(new Error('NotAllowedError')),
    };
    const adapter = createUserMediaSourceAdapter({ userMediaApi: api });
    const result = await adapter.open(buildCommand());
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('invariant-violation');
  });

  it('rejects a command whose sourceType is not microphone', async () => {
    const api = buildApi();
    const adapter = createUserMediaSourceAdapter({ userMediaApi: api });
    const result = await adapter.open({
      sourceType: 'tab',
      sessionIdentifier,
      tabId: 1,
    });
    expect(result.isErr()).toBe(true);
    expect(api.getUserMedia).not.toHaveBeenCalled();
  });

  it('close stops all tracks on the captured stream', async () => {
    const trackStop = vi.fn();
    const stream = new MediaStream();
    addFakeTrack(stream, { stop: trackStop });
    const api: UserMediaApi = {
      getUserMedia: () => Promise.resolve(stream),
    };
    const adapter = createUserMediaSourceAdapter({ userMediaApi: api });
    await adapter.open(buildCommand());
    const result = await adapter.close(sessionIdentifier);
    expect(result.isOk()).toBe(true);
    expect(trackStop).toHaveBeenCalledTimes(1);
  });

  it('close is a no-op if session was never opened', async () => {
    const api = buildApi();
    const adapter = createUserMediaSourceAdapter({ userMediaApi: api });
    const result = await adapter.close(sessionIdentifier);
    expect(result.isOk()).toBe(true);
  });
});
