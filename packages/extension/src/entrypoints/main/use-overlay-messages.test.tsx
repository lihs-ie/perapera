import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useOverlayMessages } from './use-overlay-messages';

const SESSION_ID_A = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const SESSION_ID_B = '01HZX8Y1R8M7D3Q2P4T5V6W7B2';
const SEGMENT_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7C3';

type Listener = Parameters<typeof chrome.runtime.onMessage.addListener>[0];

describe('useOverlayMessages', () => {
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

  it('registers a listener on mount and removes it on unmount', () => {
    const { unmount } = renderHook(() => useOverlayMessages());
    expect(addSpy).toHaveBeenCalledOnce();
    unmount();
    expect(removeSpy).toHaveBeenCalledOnce();
  });

  it('starts with null sessionIdentifier and empty lines', () => {
    const { result } = renderHook(() => useOverlayMessages());
    expect(result.current.sessionIdentifier).toBeNull();
    expect(result.current.lines).toHaveLength(0);
  });

  it('captures sessionIdentifier on overlay.mount', () => {
    const { result } = renderHook(() => useOverlayMessages());
    const listener = listeners[0];
    if (listener === undefined) throw new Error('listener missing');
    act(() => {
      listener({ type: 'overlay.mount', sessionIdentifier: SESSION_ID_A }, {}, () => undefined);
    });
    expect(result.current.sessionIdentifier).toBe(SESSION_ID_A);
    expect(result.current.lines).toHaveLength(0);
  });

  it('updates lines on overlay.render for the same session', () => {
    const { result } = renderHook(() => useOverlayMessages());
    const listener = listeners[0];
    if (listener === undefined) throw new Error('listener missing');
    act(() => {
      listener({ type: 'overlay.mount', sessionIdentifier: SESSION_ID_A }, {}, () => undefined);
    });
    act(() => {
      listener(
        {
          type: 'overlay.render',
          model: {
            sessionIdentifier: SESSION_ID_A,
            lines: [
              {
                segmentIdentifier: SEGMENT_ID,
                originalText: 'hello',
                translatedText: 'こんにちは',
                targetLanguage: 'ja-JP',
                isFinal: true,
              },
            ],
          },
        },
        {},
        () => undefined,
      );
    });
    expect(result.current.lines).toHaveLength(1);
    expect(result.current.lines[0]?.originalText).toBe('hello');
    expect(result.current.lines[0]?.translatedText).toBe('こんにちは');
  });

  it('ignores overlay.render for a different session (after mount)', () => {
    const { result } = renderHook(() => useOverlayMessages());
    const listener = listeners[0];
    if (listener === undefined) throw new Error('listener missing');
    act(() => {
      listener({ type: 'overlay.mount', sessionIdentifier: SESSION_ID_A }, {}, () => undefined);
    });
    act(() => {
      listener(
        {
          type: 'overlay.render',
          model: {
            sessionIdentifier: SESSION_ID_B,
            lines: [
              {
                segmentIdentifier: SEGMENT_ID,
                originalText: 'other',
                translatedText: 'other ja',
                targetLanguage: 'ja-JP',
                isFinal: true,
              },
            ],
          },
        },
        {},
        () => undefined,
      );
    });
    expect(result.current.sessionIdentifier).toBe(SESSION_ID_A);
    expect(result.current.lines).toHaveLength(0);
  });

  it('adopts sessionIdentifier from overlay.render when no prior mount', () => {
    // start-source-session-use-case は overlayPresenter.mount を明示的に呼ばず、
    // 最初の transcript.partial/final で render が broadcast される。受信側は
    // mount 不在でも先行 render を受け入れる必要がある。
    const { result } = renderHook(() => useOverlayMessages());
    const listener = listeners[0];
    if (listener === undefined) throw new Error('listener missing');
    act(() => {
      listener(
        {
          type: 'overlay.render',
          model: {
            sessionIdentifier: SESSION_ID_A,
            lines: [
              {
                segmentIdentifier: SEGMENT_ID,
                originalText: 'hello',
                translatedText: 'こんにちは',
                targetLanguage: 'ja-JP',
                isFinal: true,
              },
            ],
          },
        },
        {},
        () => undefined,
      );
    });
    expect(result.current.sessionIdentifier).toBe(SESSION_ID_A);
    expect(result.current.lines).toHaveLength(1);
    expect(result.current.lines[0]?.translatedText).toBe('こんにちは');
  });

  it('resets state on overlay.unmount for the same session', () => {
    const { result } = renderHook(() => useOverlayMessages());
    const listener = listeners[0];
    if (listener === undefined) throw new Error('listener missing');
    act(() => {
      listener({ type: 'overlay.mount', sessionIdentifier: SESSION_ID_A }, {}, () => undefined);
    });
    act(() => {
      listener({ type: 'overlay.unmount', sessionIdentifier: SESSION_ID_A }, {}, () => undefined);
    });
    expect(result.current.sessionIdentifier).toBeNull();
    expect(result.current.lines).toHaveLength(0);
  });

  it('returns false for non-OverlayCommand messages', () => {
    renderHook(() => useOverlayMessages());
    const listener = listeners[0];
    if (listener === undefined) throw new Error('listener missing');
    const ret = listener({ type: 'audio.frame.forward' }, {}, () => undefined);
    expect(ret).toBe(false);
  });
});
