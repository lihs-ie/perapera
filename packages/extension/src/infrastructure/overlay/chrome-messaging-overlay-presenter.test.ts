import { describe, expect, it } from 'vitest';
import { createOverlaySettings } from '../../domain/profile/overlay-settings';
import {
  parseSessionIdentifier,
  type SessionIdentifier,
} from '../../domain/session/session-identifier';
import { parseSegmentIdentifier } from '../../domain/transcript/segment-identifier';
import {
  createChromeMessagingOverlayPresenter,
  type OverlayCommand,
  type OverlayMessagingBridge,
} from './chrome-messaging-overlay-presenter';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const SEGMENT_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7D1';

const identifier: SessionIdentifier = parseSessionIdentifier(SESSION_ID)._unsafeUnwrap();

const createRecordingBridge = (
  failOn?: OverlayCommand['type'],
): { bridge: OverlayMessagingBridge; captured: OverlayCommand[] } => {
  const captured: OverlayCommand[] = [];
  return {
    captured,
    bridge: {
      send: (message) => {
        captured.push(message);
        if (failOn !== undefined && message.type === failOn) {
          return Promise.reject(new Error(`send failed for ${message.type}`));
        }
        return Promise.resolve();
      },
    },
  };
};

describe('createChromeMessagingOverlayPresenter (IMPL-331)', () => {
  it('forwards mount commands to the bridge', async () => {
    const { bridge, captured } = createRecordingBridge();
    const presenter = createChromeMessagingOverlayPresenter({ bridge });
    const result = await presenter.mount(identifier);
    expect(result.isOk()).toBe(true);
    expect(captured).toEqual([{ type: 'overlay.mount', sessionIdentifier: identifier }]);
  });

  it('forwards render commands with the full model', async () => {
    const { bridge, captured } = createRecordingBridge();
    const presenter = createChromeMessagingOverlayPresenter({ bridge });
    const segmentId = parseSegmentIdentifier(SEGMENT_ID)._unsafeUnwrap();
    const result = await presenter.render({
      sessionIdentifier: identifier,
      lines: [
        {
          segmentIdentifier: segmentId,
          originalText: 'hello',
          translatedText: 'こんにちは',
          targetLanguage: 'ja-JP',
          isFinal: true,
          precedingSegmentIdentifier: null,
          hasTranslationContext: false,
        },
      ],
    });
    expect(result.isOk()).toBe(true);
    expect(captured).toHaveLength(1);
    expect(captured[0]?.type).toBe('overlay.render');
    if (captured[0]?.type === 'overlay.render') {
      expect(captured[0].model.lines[0]?.translatedText).toBe('こんにちは');
    }
  });

  it('forwards updateSettings commands', async () => {
    const { bridge, captured } = createRecordingBridge();
    const presenter = createChromeMessagingOverlayPresenter({ bridge });
    const settings = createOverlaySettings({
      positionPreset: 'bottom',
      opacity: 0.8,
      maxLines: 2,
      fontScale: 1,
      showOriginalText: true,
      showTranslatedText: true,
    })._unsafeUnwrap();
    const result = await presenter.updateSettings(identifier, settings);
    expect(result.isOk()).toBe(true);
    expect(captured[0]?.type).toBe('overlay.update-settings');
  });

  it('forwards unmount commands', async () => {
    const { bridge, captured } = createRecordingBridge();
    const presenter = createChromeMessagingOverlayPresenter({ bridge });
    const result = await presenter.unmount(identifier);
    expect(result.isOk()).toBe(true);
    expect(captured).toEqual([{ type: 'overlay.unmount', sessionIdentifier: identifier }]);
  });

  it('returns invariant-violation when the bridge rejects', async () => {
    const { bridge } = createRecordingBridge('overlay.render');
    const presenter = createChromeMessagingOverlayPresenter({ bridge });
    const result = await presenter.render({
      sessionIdentifier: identifier,
      lines: [],
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.kind).toBe('invariant-violation');
      if (result.error.kind === 'invariant-violation') {
        expect(result.error.invariant).toBe('overlay-messaging');
      }
    }
  });
});
