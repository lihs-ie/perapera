import { defineConfig } from 'wxt';

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
    resolve: {
      alias: {
        '@': '/src',
      },
    },
  }),
  runner: {
    startUrls: ['https://example.com'],
  },
});
