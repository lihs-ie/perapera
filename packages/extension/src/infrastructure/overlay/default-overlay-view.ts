import { type OverlaySettings } from '../../domain/profile/overlay-settings';
import { type OverlayRenderModel } from '../../application/ports/overlay-presenter';
import { type OverlayView, type OverlayViewFactory } from './content-script-overlay-presenter';

/**
 * DOM 操作を presenter から分離するための薄い contract。
 * production では `document` をそのまま使う default 実装、test では
 * jsdom 上で host を作る mock を注入する。
 */
export type OverlayDocumentApi = {
  createHost: () => { host: HTMLElement; shadowRoot: ShadowRoot };
  removeHost: (host: HTMLElement) => void;
};

/**
 * Production `OverlayDocumentApi` 実装 (mock ではない)。
 * content script の `document` に絶対配置の Shadow host を追加する。
 *
 * - `position: fixed` で viewport 基準の overlay
 * - `pointer-events: none` でページ操作を妨げない
 * - `z-index: 2147483647` で最前面 (chrome 拡張の慣例値)
 * - `all: initial` でページ CSS 継承を遮断
 */
export const defaultOverlayDocumentApi: OverlayDocumentApi = {
  createHost: () => {
    const host = document.createElement('div');
    host.setAttribute('data-perapera-overlay', '');
    host.style.cssText = [
      'all: initial',
      'position: fixed',
      'left: 0',
      'right: 0',
      'bottom: 0',
      'pointer-events: none',
      'z-index: 2147483647',
    ].join(';');
    document.body.append(host);
    const shadowRoot = host.attachShadow({ mode: 'open' });
    return { host, shadowRoot };
  },
  removeHost: (host) => {
    host.remove();
  },
};

export type DefaultOverlayViewFactoryDependencies = Readonly<{
  documentApi: OverlayDocumentApi;
}>;

const BASE_STYLE = `
:host { color-scheme: light dark; }
.perapera-overlay-container {
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: calc(16px * var(--perapera-font-scale, 1));
  line-height: 1.4;
  color: white;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
  background: rgba(0, 0, 0, 0.5);
  padding: 0.5em 1em;
  margin: 1em;
  border-radius: 0.25em;
  max-width: 90vw;
  pointer-events: auto;
}
.perapera-overlay-line { margin: 0.2em 0; }
.perapera-overlay-original { opacity: 0.7; }
.perapera-overlay-translated { font-weight: 500; }
`;

const renderLines = (
  root: HTMLElement,
  model: OverlayRenderModel,
  settings: OverlaySettings | null,
): void => {
  root.replaceChildren();
  const displayLines =
    settings !== null && settings.maxLines > 0
      ? model.lines.slice(Math.max(0, model.lines.length - settings.maxLines))
      : model.lines;
  for (const line of displayLines) {
    const lineEl = document.createElement('div');
    lineEl.className = 'perapera-overlay-line';
    lineEl.setAttribute('data-segment-identifier', line.segmentIdentifier);
    if (line.originalText !== null) {
      const original = document.createElement('span');
      original.className = 'perapera-overlay-original';
      original.textContent = line.originalText;
      lineEl.append(original);
    }
    if (line.translatedText !== null) {
      if (line.originalText !== null) lineEl.append(document.createElement('br'));
      const translated = document.createElement('span');
      translated.className = 'perapera-overlay-translated';
      translated.textContent = line.translatedText;
      lineEl.append(translated);
    }
    root.append(lineEl);
  }
};

/**
 * `positionPreset` を host (Shadow DOM を抱える fixed 要素) の inline style に
 * 反映する。`settings === null` の場合は初期値 (bottom 配置) に復帰する。
 */
const applyPositionPreset = (host: HTMLElement, settings: OverlaySettings | null): void => {
  if (settings === null) {
    host.style.top = 'auto';
    host.style.bottom = '0';
    host.style.transform = '';
    host.style.justifyContent = 'flex-end';
    return;
  }
  switch (settings.positionPreset) {
    case 'top':
      host.style.top = '0';
      host.style.bottom = 'auto';
      host.style.transform = '';
      host.style.justifyContent = 'flex-start';
      break;
    case 'bottom':
      host.style.top = 'auto';
      host.style.bottom = '0';
      host.style.transform = '';
      host.style.justifyContent = 'flex-end';
      break;
    case 'floating':
      host.style.top = '50%';
      host.style.bottom = 'auto';
      host.style.transform = 'translateY(-50%)';
      host.style.justifyContent = 'center';
      break;
  }
};

const applySettings = (root: HTMLElement, settings: OverlaySettings | null): void => {
  if (settings === null) {
    root.style.removeProperty('opacity');
    root.style.removeProperty('--perapera-font-scale');
    return;
  }
  root.style.opacity = String(settings.opacity);
  root.style.setProperty('--perapera-font-scale', String(settings.fontScale));
};

/**
 * IMPL-330 production `OverlayViewFactory`。Shadow DOM 直接操作で overlay を
 * 描画する。React は bundle size を抑えるため採用せず、MVP の線量であれば
 * DOM API で十分。複雑化したら React 化を再評価する。
 *
 * - mount: Shadow host + base `<style>` + root `<div>` を生成
 * - update: root `<div>` に lines を再描画、settings に応じて opacity /
 *   font scale を変更
 * - unmount: host を DOM から取り除く
 */
export const createDefaultOverlayViewFactory = (
  deps: DefaultOverlayViewFactoryDependencies,
): OverlayViewFactory => {
  return (_sessionIdentifier): OverlayView => {
    let hostElement: HTMLElement | null = null;
    let rootElement: HTMLElement | null = null;

    return {
      mount: () => {
        const { host, shadowRoot } = deps.documentApi.createHost();
        hostElement = host;
        const style = document.createElement('style');
        style.textContent = BASE_STYLE;
        const root = document.createElement('div');
        root.className = 'perapera-overlay-container';
        root.setAttribute('data-perapera-overlay-root', '');
        shadowRoot.append(style, root);
        rootElement = root;
      },
      update: (model, settings) => {
        if (rootElement === null) return;
        applySettings(rootElement, settings);
        if (hostElement !== null) applyPositionPreset(hostElement, settings);
        renderLines(rootElement, model, settings);
      },
      unmount: () => {
        if (hostElement !== null) {
          deps.documentApi.removeHost(hostElement);
          hostElement = null;
        }
        rootElement = null;
      },
    };
  };
};
