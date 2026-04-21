import { describe, expect, it, vi } from 'vitest';
import {
  parseSessionIdentifier,
  type SessionIdentifier,
} from '../../domain/session/session-identifier';
import { createOverlaySettings, type OverlaySettings } from '../../domain/profile/overlay-settings';
import { parseSegmentIdentifier } from '../../domain/transcript/segment-identifier';
import { type OverlayRenderModel } from '../../application/ports/overlay-presenter';
import { createDefaultOverlayViewFactory, type OverlayDocumentApi } from './default-overlay-view';

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

const buildModel = (overrides: Partial<OverlayRenderModel> = {}): OverlayRenderModel => ({
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
  ...overrides,
});

const buildDocumentApi = () => {
  const host = document.createElement('div');
  const shadowRoot = host.attachShadow({ mode: 'open' });
  const createHost = vi.fn(() => ({ host, shadowRoot }));
  const removeHost = vi.fn();
  const api: OverlayDocumentApi = { createHost, removeHost };
  return { api, host, shadowRoot, createHost, removeHost };
};

describe('createDefaultOverlayViewFactory (IMPL-330 production helper)', () => {
  it('mount creates a shadow host and renders an empty root', () => {
    const { api, shadowRoot, createHost } = buildDocumentApi();
    const factory = createDefaultOverlayViewFactory({ documentApi: api });
    const view = factory(sessionIdentifier);
    view.mount();
    expect(createHost).toHaveBeenCalledTimes(1);
    const root = shadowRoot.querySelector('[data-perapera-overlay-root]');
    expect(root).not.toBeNull();
  });

  it('update writes original and translated lines into the shadow root', () => {
    const { api, shadowRoot } = buildDocumentApi();
    const factory = createDefaultOverlayViewFactory({ documentApi: api });
    const view = factory(sessionIdentifier);
    view.mount();
    view.update(buildModel(), settings);
    const text = shadowRoot.textContent ?? '';
    expect(text).toContain('Hello');
    expect(text).toContain('こんにちは');
  });

  it('update is a no-op when called before mount', () => {
    const { api } = buildDocumentApi();
    const factory = createDefaultOverlayViewFactory({ documentApi: api });
    const view = factory(sessionIdentifier);
    expect(() => {
      view.update(buildModel(), settings);
    }).not.toThrow();
  });

  it('update applies opacity and fontScale from settings to the root container', () => {
    const { api, shadowRoot } = buildDocumentApi();
    const factory = createDefaultOverlayViewFactory({ documentApi: api });
    const view = factory(sessionIdentifier);
    view.mount();
    const custom = createOverlaySettings({
      positionPreset: 'top',
      opacity: 0.5,
      maxLines: 3,
      fontScale: 1.5,
      showOriginalText: true,
      showTranslatedText: true,
    })._unsafeUnwrap();
    view.update(buildModel(), custom);
    const root = shadowRoot.querySelector('[data-perapera-overlay-root]');
    expect(root).not.toBeNull();
    if (root instanceof HTMLElement) {
      expect(root.style.opacity).toBe('0.5');
      expect(root.style.getPropertyValue('--perapera-font-scale')).toBe('1.5');
    }
  });

  it('update renders without settings (settings=null): defaults apply', () => {
    const { api, shadowRoot } = buildDocumentApi();
    const factory = createDefaultOverlayViewFactory({ documentApi: api });
    const view = factory(sessionIdentifier);
    view.mount();
    view.update(buildModel(), null);
    const text = shadowRoot.textContent ?? '';
    expect(text).toContain('Hello');
  });

  it('unmount removes the host and prevents further updates', () => {
    const { api, host, removeHost } = buildDocumentApi();
    const factory = createDefaultOverlayViewFactory({ documentApi: api });
    const view = factory(sessionIdentifier);
    view.mount();
    view.unmount();
    expect(removeHost).toHaveBeenCalledWith(host);
    // Subsequent update should not throw
    expect(() => {
      view.update(buildModel(), settings);
    }).not.toThrow();
  });

  it('unmount is safe to call multiple times', () => {
    const { api } = buildDocumentApi();
    const factory = createDefaultOverlayViewFactory({ documentApi: api });
    const view = factory(sessionIdentifier);
    view.mount();
    view.unmount();
    expect(() => {
      view.unmount();
    }).not.toThrow();
  });
});
