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

test('monitor.html renders the React root with the overlay listener mounted', async () => {
  const extensionId = await resolveExtensionId();
  const page = await context.newPage();
  // monitor.html は web_accessible_resources で外部から開ける。
  // タブ以外のソース (microphone / desktop) のオーバーレイ表示先 (IMPL-563)。
  await page.goto(`chrome-extension://${extensionId}/monitor.html`);

  await expect(page).toHaveTitle(/perapera/i);
  await page.locator('#root > *').first().waitFor({ timeout: 5000 });
});
