import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOverlayListener } from './use-overlay-listener';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const SEGMENT_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A2';

type Listener = Parameters<typeof chrome.runtime.onMessage.addListener>[0];

describe('useOverlayListener (IMPL-563)', () => {
  let listeners: Listener[];
  let addSpy: ReturnType<typeof vi.fn>;
  let removeSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    listeners = [];
    addSpy = vi.fn((listener: Listener) => {
      listeners.push(listener);
    });
    removeSpy = vi.fn((listener: Listener) => {
      listeners = listeners.filter((entry) => entry !== listener);
    });
    Object.defineProperty(chrome.runtime, 'onMessage', {
      value: {
        addListener: addSpy,
        removeListener: removeSpy,
        hasListener: vi.fn(),
      },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    listeners = [];
    // Overlay hosts are appended imperatively to document.body; RTL cleanup
    // doesn't remove them. Clean up here to avoid cross-test leakage.
    for (const host of document.querySelectorAll('[data-perapera-overlay]')) {
      host.remove();
    }
  });

  it('registers a listener on mount and removes it on unmount', () => {
    const { unmount } = renderHook(() => useOverlayListener());
    expect(addSpy).toHaveBeenCalledOnce();
    unmount();
    expect(removeSpy).toHaveBeenCalledOnce();
  });

  it('mounts a Shadow DOM overlay host on overlay.mount command', async () => {
    renderHook(() => useOverlayListener());
    const listener = listeners[0];
    if (listener === undefined) throw new Error('listener not registered');
    const sendResponse = vi.fn();
    listener({ type: 'overlay.mount', sessionIdentifier: SESSION_ID }, {}, sendResponse);
    await waitFor(() => expect(sendResponse).toHaveBeenCalledOnce());
    const host = document.querySelector('[data-perapera-overlay]');
    expect(host).not.toBeNull();
  });

  it('renders a Shadow DOM line on overlay.render command', async () => {
    renderHook(() => useOverlayListener());
    const listener = listeners[0];
    if (listener === undefined) throw new Error('listener not registered');
    const mountResponse = vi.fn();
    listener({ type: 'overlay.mount', sessionIdentifier: SESSION_ID }, {}, mountResponse);
    await waitFor(() => expect(mountResponse).toHaveBeenCalledOnce());
    const renderResponse = vi.fn();
    listener(
      {
        type: 'overlay.render',
        model: {
          sessionIdentifier: SESSION_ID,
          lines: [
            {
              segmentIdentifier: SEGMENT_ID,
              originalText: 'Hello',
              translatedText: 'こんにちは',
              targetLanguage: 'ja',
              isFinal: true,
            },
          ],
        },
      },
      {},
      renderResponse,
    );
    await waitFor(() => expect(renderResponse).toHaveBeenCalledOnce());
    const host = document.querySelector('[data-perapera-overlay]');
    const shadowText = host?.shadowRoot?.textContent ?? '';
    expect(shadowText).toContain('Hello');
    expect(shadowText).toContain('こんにちは');
  });

  it('silently ignores non-OverlayCommand messages (returns false)', () => {
    renderHook(() => useOverlayListener());
    const listener = listeners[0];
    if (listener === undefined) throw new Error('listener not registered');
    const sendResponse = vi.fn();
    const ret = listener({ type: 'command.start-source-session' }, {}, sendResponse);
    expect(ret).toBe(false);
    expect(sendResponse).not.toHaveBeenCalled();
  });
});
