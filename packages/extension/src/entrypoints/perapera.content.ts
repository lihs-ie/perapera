import { defineContentScript } from 'wxt/sandbox';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { OverlayApp } from './content/OverlayApp';
import overlayCssText from './content/overlay.css?inline';

/**
 * Content script — host page 上に Shadow DOM root を注入し、Overlay React を
 * mount する。perapera-scenes.jsx OverlayScene の panel を再現する。
 *
 * 注意:
 * - Shadow DOM (closed) で host page の CSS と完全分離
 * - Google Fonts は host head に link を追加 (Shadow Root 内 @import が
 *   効かないブラウザに対応)
 */
export default defineContentScript({
  matches: ['https://*/*'],
  runAt: 'document_idle',
  main() {
    if (document.getElementById('perapera-overlay-host') !== null) return;

    // Inject Google Fonts into the host head once.
    if (document.querySelector('link[data-perapera-fonts]') === null) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href =
        'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+JP:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap';
      link.dataset.peraperaFonts = 'true';
      document.head.appendChild(link);
    }

    const host = document.createElement('div');
    host.id = 'perapera-overlay-host';
    host.style.position = 'fixed';
    host.style.inset = '0';
    host.style.pointerEvents = 'none';
    host.style.zIndex = '2147483647';
    document.body.appendChild(host);

    const shadowRoot = host.attachShadow({ mode: 'closed' });
    const styleEl = document.createElement('style');
    styleEl.textContent = overlayCssText;
    shadowRoot.appendChild(styleEl);

    const reactRoot = document.createElement('div');
    reactRoot.id = 'perapera-overlay-react-root';
    shadowRoot.appendChild(reactRoot);

    const root = createRoot(reactRoot);
    root.render(React.createElement(OverlayApp));
  },
});
