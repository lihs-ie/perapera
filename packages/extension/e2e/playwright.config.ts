import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(__dirname, '../.output/chrome-mv3');

export default defineConfig({
  testDir: './specs',
  fullyParallel: false,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 2 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium-extension',
      use: {
        channel: 'chromium',
        launchOptions: {
          args: [
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`,
          ],
        },
      },
    },
  ],
});
