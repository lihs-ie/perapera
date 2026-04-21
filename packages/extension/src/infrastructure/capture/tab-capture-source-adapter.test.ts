import { describe, expect, it, vi } from 'vitest';
import {
  parseSessionIdentifier,
  type SessionIdentifier,
} from '../../domain/session/session-identifier';
import { type StartSourceCommand } from '../../application/ports/source-adapter';
import { addFakeTrack } from '../../../tests/helpers/media-stream';
import { createTabCaptureSourceAdapter, type TabCaptureApi } from './tab-capture-source-adapter';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const sessionIdentifier: SessionIdentifier = parseSessionIdentifier(SESSION_ID)._unsafeUnwrap();

const buildCommand = (overrides: Partial<StartSourceCommand> = {}): StartSourceCommand => ({
  sourceType: 'tab',
  sessionIdentifier,
  tabId: 42,
  ...overrides,
});

const buildApi = (): TabCaptureApi & {
  capture: ReturnType<typeof vi.fn<TabCaptureApi['capture']>>;
} => {
  const stream = new MediaStream();
  const capture = vi.fn<TabCaptureApi['capture']>(() => Promise.resolve(stream));
  return { capture };
};

describe('createTabCaptureSourceAdapter (IMPL-300, DD-101)', () => {
  it('captures a MediaStream with audio-only constraints', async () => {
    const api = buildApi();
    const adapter = createTabCaptureSourceAdapter({ tabCaptureApi: api });
    const result = await adapter.open(buildCommand());
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value).toBeInstanceOf(MediaStream);
    const options = api.capture.mock.calls[0]?.[0];
    expect(options).toMatchObject({ audio: true, video: false });
  });

  it('rejects a non-tab command', async () => {
    const api = buildApi();
    const adapter = createTabCaptureSourceAdapter({ tabCaptureApi: api });
    const result = await adapter.open({
      sourceType: 'microphone',
      sessionIdentifier,
      deviceId: 'default',
    });
    expect(result.isErr()).toBe(true);
    expect(api.capture).not.toHaveBeenCalled();
  });

  it('returns invariant-violation when capture returns null (tab no longer audible)', async () => {
    const api: TabCaptureApi = {
      capture: () => Promise.resolve(null),
    };
    const adapter = createTabCaptureSourceAdapter({ tabCaptureApi: api });
    const result = await adapter.open(buildCommand());
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('invariant-violation');
  });

  it('returns invariant-violation when the api throws (e.g., chrome.runtime.lastError)', async () => {
    const api: TabCaptureApi = {
      capture: () => Promise.reject(new Error('Tab is not currently being captured')),
    };
    const adapter = createTabCaptureSourceAdapter({ tabCaptureApi: api });
    const result = await adapter.open(buildCommand());
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.kind).toBe('invariant-violation');
      if (result.error.kind === 'invariant-violation') {
        expect(result.error.details).toContain('Tab is not currently being captured');
      }
    }
  });

  it('close stops tracks on the captured stream', async () => {
    const stop = vi.fn();
    const stream = new MediaStream();
    addFakeTrack(stream, { stop });
    const api: TabCaptureApi = { capture: () => Promise.resolve(stream) };
    const adapter = createTabCaptureSourceAdapter({ tabCaptureApi: api });
    await adapter.open(buildCommand());
    const result = await adapter.close(sessionIdentifier);
    expect(result.isOk()).toBe(true);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('close is a no-op when session was never opened', async () => {
    const api = buildApi();
    const adapter = createTabCaptureSourceAdapter({ tabCaptureApi: api });
    const result = await adapter.close(sessionIdentifier);
    expect(result.isOk()).toBe(true);
  });
});
