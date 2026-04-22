import { describe, expect, it, vi } from 'vitest';
import {
  parseSessionIdentifier,
  type SessionIdentifier,
} from '../../domain/session/session-identifier';
import { type OffscreenCommand } from '../../entrypoints/offscreen/offscreen-commands';
import {
  createChromeRuntimeMessageBridge,
  type ChromeRuntimeApi,
} from './chrome-runtime-message-bridge';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const identifier: SessionIdentifier = parseSessionIdentifier(SESSION_ID)._unsafeUnwrap();

const buildApi = (overrides: Partial<ChromeRuntimeApi> = {}): ChromeRuntimeApi => ({
  sendMessage: vi.fn(() => Promise.resolve(undefined)),
  ...overrides,
});

describe('createChromeRuntimeMessageBridge (IMPL-606)', () => {
  it('forwards OffscreenCommand to chrome.runtime.sendMessage', async () => {
    const api = buildApi();
    const bridge = createChromeRuntimeMessageBridge(api);
    const command: OffscreenCommand = {
      type: 'offscreen.audio.open',
      sessionIdentifier: identifier,
    };

    const result = await bridge.sendMessage(command);

    expect(result.isOk()).toBe(true);
    expect(api.sendMessage).toHaveBeenCalledWith(command);
  });

  it('maps Promise rejection to invariantViolationError', async () => {
    const api = buildApi({
      sendMessage: vi.fn(() => Promise.reject(new Error('no listener'))),
    });
    const bridge = createChromeRuntimeMessageBridge(api);
    const command: OffscreenCommand = {
      type: 'offscreen.audio.close',
      sessionIdentifier: identifier,
    };

    const result = await bridge.sendMessage(command);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.kind).toBe('invariant-violation');
      if (result.error.kind === 'invariant-violation') {
        expect(result.error.details).toContain('no listener');
      }
    }
  });
});
