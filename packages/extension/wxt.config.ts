import { defineConfig } from 'wxt';

const relayBaseUrl = process.env.PERAPERA_RELAY_API_BASE_URL ?? 'http://localhost:3001';
const relayAccessToken = process.env.PERAPERA_RELAY_ACCESS_TOKEN ?? '';

// https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: 'src',
  outDir: '.output',
  manifest: {
    name: 'perapera',
    description: 'リアルタイム文字起こし・翻訳オーバーレイ',
    version: '0.0.0',
    permissions: ['tabCapture', 'storage', 'sidePanel', 'offscreen', 'scripting', 'activeTab'],
    host_permissions: ['http://localhost:3001/*'],
    action: {
      default_title: 'perapera',
    },
    side_panel: {
      default_path: 'sidepanel.html',
    },
    web_accessible_resources: [
      {
        resources: ['monitor.html'],
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
