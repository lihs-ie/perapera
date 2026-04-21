import { describe, expect, it, vi } from 'vitest';
import {
  parseSessionIdentifier,
  type SessionIdentifier,
} from '../../domain/session/session-identifier';
import { type StartSourceCommand } from '../../application/ports/source-adapter';
import { addFakeTrack } from '../../../tests/helpers/media-stream';
import {
  createDesktopCaptureSourceAdapter,
  type DesktopCaptureApi,
} from './desktop-capture-source-adapter';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const sessionIdentifier: SessionIdentifier = parseSessionIdentifier(SESSION_ID)._unsafeUnwrap();

const buildCommand = (): StartSourceCommand => ({
  sourceType: 'desktop',
  sessionIdentifier,
});

const buildApi = (): DesktopCaptureApi & {
  getDisplayMedia: ReturnType<typeof vi.fn<DesktopCaptureApi['getDisplayMedia']>>;
} => {
  const stream = new MediaStream();
  const getDisplayMedia = vi.fn<DesktopCaptureApi['getDisplayMedia']>(() =>
    Promise.resolve(stream),
  );
  return { getDisplayMedia };
};

describe('createDesktopCaptureSourceAdapter (IMPL-302, DD-103)', () => {
  it('captures via getDisplayMedia with audio enabled', async () => {
    const api = buildApi();
    const adapter = createDesktopCaptureSourceAdapter({ desktopCaptureApi: api });
    const result = await adapter.open(buildCommand());
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value).toBeInstanceOf(MediaStream);
    const constraints = api.getDisplayMedia.mock.calls[0]?.[0];
    expect(constraints).toMatchObject({ audio: true });
  });

  it('rejects a non-desktop command', async () => {
    const api = buildApi();
    const adapter = createDesktopCaptureSourceAdapter({ desktopCaptureApi: api });
    const result = await adapter.open({
      sourceType: 'tab',
      sessionIdentifier,
      tabId: 1,
    });
    expect(result.isErr()).toBe(true);
    expect(api.getDisplayMedia).not.toHaveBeenCalled();
  });

  it('returns invariant-violation when getDisplayMedia rejects', async () => {
    const api: DesktopCaptureApi = {
      getDisplayMedia: () => Promise.reject(new Error('NotAllowedError')),
    };
    const adapter = createDesktopCaptureSourceAdapter({ desktopCaptureApi: api });
    const result = await adapter.open(buildCommand());
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('invariant-violation');
  });

  it('close stops tracks on the captured stream', async () => {
    const stop = vi.fn();
    const stream = new MediaStream();
    addFakeTrack(stream, { stop });
    const api: DesktopCaptureApi = { getDisplayMedia: () => Promise.resolve(stream) };
    const adapter = createDesktopCaptureSourceAdapter({ desktopCaptureApi: api });
    await adapter.open(buildCommand());
    const result = await adapter.close(sessionIdentifier);
    expect(result.isOk()).toBe(true);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('close is a no-op when session was never opened', async () => {
    const api = buildApi();
    const adapter = createDesktopCaptureSourceAdapter({ desktopCaptureApi: api });
    const result = await adapter.close(sessionIdentifier);
    expect(result.isOk()).toBe(true);
  });
});
