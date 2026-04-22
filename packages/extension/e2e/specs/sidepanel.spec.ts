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

test('sidepanel.html renders the React root with the side panel template', async () => {
  const extensionId = await resolveExtensionId();
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);

  await expect(page).toHaveTitle(/perapera/i);
  // SidePanelTemplate (IMPL-552) renders the root container under #root
  await page.locator('#root > *').first().waitFor({ timeout: 5000 });
});
