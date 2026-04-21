import { chromium, expect, test, type BrowserContext } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(__dirname, '../../.output/chrome-mv3');

let context: BrowserContext;

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
});

test.afterAll(async () => {
  await context.close();
});

test('extension loads and service worker registers', async () => {
  // MV3: background は service worker として登録される
  // 登録までに少し時間を要する可能性があるため、イベント or 既存 worker を確認
  let [serviceWorker] = context.serviceWorkers();
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker');
  }

  const url = serviceWorker.url();
  expect(url).toContain('chrome-extension://');
  expect(url).toContain('background');
});
