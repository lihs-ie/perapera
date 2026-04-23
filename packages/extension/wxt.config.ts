import { defineConfig } from 'wxt';

const relayBaseUrl = process.env.PERAPERA_RELAY_API_BASE_URL ?? 'http://localhost:3001';
const relayAccessToken = process.env.PERAPERA_RELAY_ACCESS_TOKEN ?? '';

// IMPL-710: host_permissions は build 時の PERAPERA_RELAY_API_BASE_URL から
// origin を導出して dev (localhost) / staging / production を同一 config で切替。
// Chrome の host_permissions は HTTP / WebSocket 共通で origin 単位に効くので
// `${origin}/*` 1 件でよい (wss://<origin>/relay も許可される)。
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
    // action.default_popup は未設定 → chrome.action.onClicked が発火し、
    // background.ts で main.html を独立 window として起動する。
    // 対象タブへの overlay 注入は廃止したので content_scripts / sidePanel /
    // scripting permission は不要。activeTab は main window からの
    // chrome.tabs.query (active tab 解決) で継続使用する。
    permissions: ['tabCapture', 'storage', 'offscreen', 'activeTab'],
    host_permissions: [relayHostPermission],
    action: {
      default_title: 'perapera',
    },
    web_accessible_resources: [
      {
        resources: ['main.html'],
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
