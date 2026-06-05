import { defineConfig } from 'wxt';

const relayBaseUrl = process.env.PERAPERA_RELAY_API_BASE_URL ?? 'http://localhost:3001';
const relayAccessToken = process.env.PERAPERA_RELAY_ACCESS_TOKEN ?? '';

const relayHostPermission = ((): string => {
  const url = new URL(relayBaseUrl);
  return `${url.origin}/*`;
})();

// https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: 'src',
  outDir: '.output',
  manifest: {
    name: 'perapera',
    description: 'リアルタイム文字起こし・翻訳オーバーレイ',
    version: '0.0.0',
    permissions: ['tabCapture', 'storage', 'offscreen', 'activeTab', 'alarms', 'sidePanel'],
    host_permissions: [relayHostPermission],
    action: {
      default_title: 'perapera',
      default_popup: 'popup.html',
    },
    side_panel: {
      default_path: 'sidepanel.html',
    },
    commands: {
      'open-main-window': {
        suggested_key: {
          default: 'Alt+Shift+P',
          mac: 'Alt+Shift+P',
        },
        description: 'perapera の main window を起動 / focus する',
      },
      'stop-active-session': {
        suggested_key: {
          default: 'Alt+Shift+S',
          mac: 'Alt+Shift+S',
        },
        description: '活性セッションを停止する',
      },
    },
    web_accessible_resources: [
      {
        resources: ['main.html', 'popup.html', 'sidepanel.html'],
        matches: ['<all_urls>'],
      },
    ],
  },
  vite: () => ({
    resolve: { alias: { '@': '/src' } },
    define: {
      'import.meta.env.PERAPERA_RELAY_API_BASE_URL': JSON.stringify(relayBaseUrl),
      'import.meta.env.PERAPERA_RELAY_ACCESS_TOKEN': JSON.stringify(relayAccessToken),
    },
  }),
  runner: {
    startUrls: ['https://example.com'],
  },
});
