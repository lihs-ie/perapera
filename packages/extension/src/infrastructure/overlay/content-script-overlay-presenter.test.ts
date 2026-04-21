import { describe, expect, it, vi } from 'vitest';
import {
  parseSessionIdentifier,
  type SessionIdentifier,
} from '../../domain/session/session-identifier';
import { createOverlaySettings, type OverlaySettings } from '../../domain/profile/overlay-settings';
import { parseSegmentIdentifier } from '../../domain/transcript/segment-identifier';
import { type OverlayRenderModel } from '../../application/ports/overlay-presenter';
import {
  createContentScriptOverlayPresenter,
  type OverlayView,
  type OverlayViewFactory,
} from './content-script-overlay-presenter';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const sessionIdentifier: SessionIdentifier = parseSessionIdentifier(SESSION_ID)._unsafeUnwrap();
const SEGMENT_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A2';
const segmentIdentifier = parseSegmentIdentifier(SEGMENT_ID)._unsafeUnwrap();

const settings: OverlaySettings = createOverlaySettings({
  positionPreset: 'bottom',
  opacity: 0.85,
  maxLines: 2,
  fontScale: 1,
  showOriginalText: true,
  showTranslatedText: true,
})._unsafeUnwrap();

type MockView = OverlayView & {
  mount: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  unmount: ReturnType<typeof vi.fn>;
};

const buildView = (): MockView => ({
  mount: vi.fn(),
  update: vi.fn(),
  unmount: vi.fn(),
});

const buildFactory = (view: OverlayView): OverlayViewFactory =>
  vi.fn<OverlayViewFactory>(() => view);

const buildRenderModel = (): OverlayRenderModel => ({
  sessionIdentifier,
  lines: [
    {
      segmentIdentifier,
      originalText: 'Hello',
      translatedText: 'こんにちは',
      targetLanguage: 'ja',
      isFinal: true,
    },
  ],
});

describe('createContentScriptOverlayPresenter (IMPL-330, DD-108)', () => {
  it('mount calls the view factory and mounts the view', async () => {
    const view = buildView();
    const factory = buildFactory(view);
    const presenter = createContentScriptOverlayPresenter({ overlayViewFactory: factory });
    const result = await presenter.mount(sessionIdentifier);
    expect(result.isOk()).toBe(true);
    expect(factory).toHaveBeenCalledWith(sessionIdentifier);
    expect(view.mount).toHaveBeenCalledTimes(1);
  });

  it('mount is rejected when session already has a mounted view', async () => {
    const view = buildView();
    const presenter = createContentScriptOverlayPresenter({
      overlayViewFactory: buildFactory(view),
    });
    await presenter.mount(sessionIdentifier);
    const result = await presenter.mount(sessionIdentifier);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('invariant-violation');
  });

  it('render pushes the model into the view with settings=null before updateSettings', async () => {
    const view = buildView();
    const presenter = createContentScriptOverlayPresenter({
      overlayViewFactory: buildFactory(view),
    });
    await presenter.mount(sessionIdentifier);
    const model = buildRenderModel();
    const result = await presenter.render(model);
    expect(result.isOk()).toBe(true);
    expect(view.update).toHaveBeenCalledWith(model, null);
  });

  it('render is rejected when the session has no mounted view', async () => {
    const view = buildView();
    const presenter = createContentScriptOverlayPresenter({
      overlayViewFactory: buildFactory(view),
    });
    const result = await presenter.render(buildRenderModel());
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('invariant-violation');
    expect(view.update).not.toHaveBeenCalled();
  });

  it('updateSettings stores settings; subsequent render passes them through', async () => {
    const view = buildView();
    const presenter = createContentScriptOverlayPresenter({
      overlayViewFactory: buildFactory(view),
    });
    await presenter.mount(sessionIdentifier);
    const updateResult = await presenter.updateSettings(sessionIdentifier, settings);
    expect(updateResult.isOk()).toBe(true);
    const model = buildRenderModel();
    await presenter.render(model);
    expect(view.update).toHaveBeenLastCalledWith(model, settings);
  });

  it('updateSettings is rejected when the session has no mounted view', async () => {
    const view = buildView();
    const presenter = createContentScriptOverlayPresenter({
      overlayViewFactory: buildFactory(view),
    });
    const result = await presenter.updateSettings(sessionIdentifier, settings);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('invariant-violation');
  });

  it('unmount calls view.unmount and removes the session', async () => {
    const view = buildView();
    const presenter = createContentScriptOverlayPresenter({
      overlayViewFactory: buildFactory(view),
    });
    await presenter.mount(sessionIdentifier);
    const result = await presenter.unmount(sessionIdentifier);
    expect(result.isOk()).toBe(true);
    expect(view.unmount).toHaveBeenCalledTimes(1);

    const remount = await presenter.mount(sessionIdentifier);
    expect(remount.isOk()).toBe(true);
  });

  it('unmount is a no-op when the session was never mounted', async () => {
    const view = buildView();
    const presenter = createContentScriptOverlayPresenter({
      overlayViewFactory: buildFactory(view),
    });
    const result = await presenter.unmount(sessionIdentifier);
    expect(result.isOk()).toBe(true);
    expect(view.unmount).not.toHaveBeenCalled();
  });

  it('mount surfaces factory failure as invariant-violation', async () => {
    const failing: OverlayViewFactory = () => {
      throw new Error('shadow host creation failed');
    };
    const presenter = createContentScriptOverlayPresenter({ overlayViewFactory: failing });
    const result = await presenter.mount(sessionIdentifier);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.kind).toBe('invariant-violation');
      if (result.error.kind === 'invariant-violation') {
        expect(result.error.details).toContain('shadow host creation failed');
      }
    }
  });

  it('render surfaces view.update failure as invariant-violation', async () => {
    const view: OverlayView = {
      mount: vi.fn(),
      update: vi.fn(() => {
        throw new Error('react render failed');
      }),
      unmount: vi.fn(),
    };
    const presenter = createContentScriptOverlayPresenter({
      overlayViewFactory: buildFactory(view),
    });
    await presenter.mount(sessionIdentifier);
    const result = await presenter.render(buildRenderModel());
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('invariant-violation');
  });
});
