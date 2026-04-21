import { describe, expect, it, vi } from 'vitest';
import { createBackgroundClient, type BackgroundMessageSender } from './background-client';

const createFakeSender = (
  respond: (message: unknown) => unknown,
): { sender: BackgroundMessageSender; sent: unknown[] } => {
  const sent: unknown[] = [];
  return {
    sent,
    sender: {
      send: (message) => {
        sent.push(message);
        try {
          return Promise.resolve(respond(message));
        } catch (cause) {
          return Promise.reject(cause instanceof Error ? cause : new Error(String(cause)));
        }
      },
    },
  };
};

describe('createBackgroundClient (IMPL-514)', () => {
  it('wraps startSourceSession and validates ok response', async () => {
    const { sender, sent } = createFakeSender(() => ({
      ok: true,
      value: {
        sessionId: 'sess-1',
        state: 'requesting_permission',
        startedAt: '2026-04-22T00:00:00.000Z',
      },
    }));
    const client = createBackgroundClient(sender);
    const response = await client.startSourceSession({
      sourceType: 'tab',
      displayName: 'YouTube Live',
      autoDetectLanguage: false,
      targetLanguage: 'ja-JP',
      overlayTarget: { kind: 'tab', tabId: 42 },
    });
    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.value.sessionId).toBe('sess-1');
    }
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      type: 'command.start-source-session',
      input: { sourceType: 'tab' },
    });
  });

  it('propagates structured ApplicationError on ok=false response', async () => {
    const { sender } = createFakeSender(() => ({
      ok: false,
      error: {
        type: 'permission-required',
        code: 'CAPTURE-PERMISSION-DENIED',
        sourceType: 'tab',
        message: 'user denied',
      },
    }));
    const client = createBackgroundClient(sender);
    const response = await client.startSourceSession({
      sourceType: 'tab',
      displayName: 'x',
      autoDetectLanguage: false,
      targetLanguage: 'ja-JP',
      overlayTarget: { kind: 'tab', tabId: 42 },
    });
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.type).toBe('permission-required');
    }
  });

  it('returns internal error when response is malformed', async () => {
    const { sender } = createFakeSender(() => ({ hello: 'world' }));
    const client = createBackgroundClient(sender);
    const response = await client.stopSourceSession({ sessionId: 'sess-1' });
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.type).toBe('internal');
      expect(response.error.message).toMatch(/malformed response/);
    }
  });

  it('returns internal error when sender throws', async () => {
    const { sender } = createFakeSender(() => {
      throw new Error('chrome.runtime unavailable');
    });
    const client = createBackgroundClient(sender);
    const response = await client.stopSourceSession({ sessionId: 'sess-1' });
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.type).toBe('internal');
      expect(response.error.message).toMatch(/chrome.runtime unavailable/);
    }
  });

  it('dispatches stopSourceSession with correct envelope', async () => {
    const { sender, sent } = createFakeSender(() => ({
      ok: true,
      value: {
        sessionId: 'sess-1',
        state: 'stopped',
        stoppedAt: '2026-04-22T00:05:00.000Z',
      },
    }));
    const client = createBackgroundClient(sender);
    await client.stopSourceSession({ sessionId: 'sess-1' });
    expect(sent[0]).toMatchObject({
      type: 'command.stop-source-session',
      input: { sessionId: 'sess-1' },
    });
  });

  it('dispatches getSessionMonitorState and validates response', async () => {
    const { sender, sent } = createFakeSender(() => ({
      ok: true,
      value: {
        sessions: [{ sessionId: 'a', displayName: 'A', state: 'capturing', sourceType: 'tab' }],
        latestSegments: [],
      },
    }));
    const client = createBackgroundClient(sender);
    const response = await client.getSessionMonitorState({ includeOverlayState: false });
    expect(sent[0]).toMatchObject({ type: 'query.get-session-monitor-state' });
    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.value.sessions).toHaveLength(1);
    }
  });

  it('uses defaultBackgroundMessageSender (chrome.runtime.sendMessage) when no sender provided', async () => {
    const spy = vi.fn(() =>
      Promise.resolve({
        ok: true,
        value: {
          sessionId: 's',
          state: 'stopped',
          stoppedAt: '2026-04-22T00:00:00.000Z',
        },
      }),
    );
    const originalRuntime = chrome.runtime.sendMessage;
    Object.defineProperty(chrome.runtime, 'sendMessage', {
      value: spy,
      configurable: true,
      writable: true,
    });
    try {
      const client = createBackgroundClient();
      const response = await client.stopSourceSession({ sessionId: 'sess-1' });
      expect(response.ok).toBe(true);
      expect(spy).toHaveBeenCalledOnce();
    } finally {
      Object.defineProperty(chrome.runtime, 'sendMessage', {
        value: originalRuntime,
        configurable: true,
        writable: true,
      });
    }
  });
});
