import { errAsync, okAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import { type OverlayPresenter } from '../../application/ports/overlay-presenter';
import { createOverlaySettings } from '../../domain/profile/overlay-settings';
import {
  parseSessionIdentifier,
  type SessionIdentifier,
} from '../../domain/session/session-identifier';
import { parseSegmentIdentifier } from '../../domain/transcript/segment-identifier';
import { invariantViolationError } from '../../domain/shared/errors';
import { createOverlayDispatcher } from './overlay-dispatcher';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const SEGMENT_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A2';

const identifier: SessionIdentifier = parseSessionIdentifier(SESSION_ID)._unsafeUnwrap();
const segmentIdentifier = parseSegmentIdentifier(SEGMENT_ID)._unsafeUnwrap();

const settings = createOverlaySettings({
  positionPreset: 'bottom',
  opacity: 0.8,
  maxLines: 2,
  fontScale: 1,
  showOriginalText: true,
  showTranslatedText: true,
})._unsafeUnwrap();

const buildPresenter = (): OverlayPresenter => ({
  mount: vi.fn(() => okAsync(undefined)),
  render: vi.fn(() => okAsync(undefined)),
  updateSettings: vi.fn(() => okAsync(undefined)),
  unmount: vi.fn(() => okAsync(undefined)),
});

describe('createOverlayDispatcher (IMPL-555)', () => {
  it('dispatches overlay.mount to presenter.mount', async () => {
    const presenter = buildPresenter();
    const dispatch = createOverlayDispatcher({ presenter });
    await dispatch({ type: 'overlay.mount', sessionIdentifier: identifier });
    expect(presenter.mount).toHaveBeenCalledWith(identifier);
  });

  it('dispatches overlay.render to presenter.render', async () => {
    const presenter = buildPresenter();
    const dispatch = createOverlayDispatcher({ presenter });
    await dispatch({
      type: 'overlay.render',
      model: {
        sessionIdentifier: identifier,
        lines: [
          {
            segmentIdentifier,
            originalText: 'Hi',
            translatedText: 'こんにちは',
            targetLanguage: 'ja',
            isFinal: true,
          },
        ],
      },
    });
    expect(presenter.render).toHaveBeenCalledOnce();
  });

  it('dispatches overlay.update-settings to presenter.updateSettings', async () => {
    const presenter = buildPresenter();
    const dispatch = createOverlayDispatcher({ presenter });
    await dispatch({
      type: 'overlay.update-settings',
      sessionIdentifier: identifier,
      settings,
    });
    expect(presenter.updateSettings).toHaveBeenCalledWith(identifier, settings);
  });

  it('dispatches overlay.unmount to presenter.unmount', async () => {
    const presenter = buildPresenter();
    const dispatch = createOverlayDispatcher({ presenter });
    await dispatch({ type: 'overlay.unmount', sessionIdentifier: identifier });
    expect(presenter.unmount).toHaveBeenCalledWith(identifier);
  });

  it('logs presenter errors to logWarn and does not throw', async () => {
    const presenter: OverlayPresenter = {
      mount: vi.fn(() =>
        errAsync(invariantViolationError({ invariant: 'overlay-mount-failed', details: 'boom' })),
      ),
      render: vi.fn(() => okAsync(undefined)),
      updateSettings: vi.fn(() => okAsync(undefined)),
      unmount: vi.fn(() => okAsync(undefined)),
    };
    const logWarn = vi.fn<(message: string) => void>();
    const dispatch = createOverlayDispatcher({ presenter, logWarn });
    await expect(
      dispatch({ type: 'overlay.mount', sessionIdentifier: identifier }),
    ).resolves.toBeUndefined();
    expect(logWarn).toHaveBeenCalledOnce();
    expect(logWarn).toHaveBeenCalledWith(expect.stringMatching(/mount failed/));
  });

  it('uses console.warn as default sink when logWarn is not provided', async () => {
    const presenter: OverlayPresenter = {
      mount: vi.fn(() => okAsync(undefined)),
      render: vi.fn(() =>
        errAsync(invariantViolationError({ invariant: 'overlay-render-failed', details: 'x' })),
      ),
      updateSettings: vi.fn(() => okAsync(undefined)),
      unmount: vi.fn(() => okAsync(undefined)),
    };
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const dispatch = createOverlayDispatcher({ presenter });
      await dispatch({
        type: 'overlay.render',
        model: { sessionIdentifier: identifier, lines: [] },
      });
      expect(consoleWarnSpy).toHaveBeenCalledOnce();
    } finally {
      consoleWarnSpy.mockRestore();
    }
  });
});
