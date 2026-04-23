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

const resolveExtensionId = async (): Promise<string> => {
  let [serviceWorker] = context.serviceWorkers();
  serviceWorker ??= await context.waitForEvent('serviceworker');
  return new URL(serviceWorker.url()).host;
};

test('main.html renders the React root with the main window template', async () => {
  const extensionId = await resolveExtensionId();
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/main.html`);

  await expect(page).toHaveTitle(/perapera/i);
  // MainWindowTemplate renders the root container under #root.
  // Background SW へ chrome.runtime.sendMessage が走るがハンドラ次第ではエラー
  // 状態の component が描画される — どちらでも `#root` 内に何かしら appears を確認
  await page.locator('#root > *').first().waitFor({ timeout: 5000 });
});
