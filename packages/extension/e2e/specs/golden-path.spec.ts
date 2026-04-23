import { chromium, expect, test, type BrowserContext, type Worker } from '@playwright/test';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnRelayDev, type RelayHandle } from '../support/relay-lifecycle';
import { startFixtureServer, type FixtureServerHandle } from '../support/fixture-server';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(__dirname, '../../.output/chrome-mv3');

/**
 * 実環境に限りなく近い E2E テスト (opt-in)。
 *
 * - Relay API (real Deepgram + DeepL via `.env.local`) を spawn or reuse
 * - 拡張を unpacked で load (popup / SW / offscreen / content script all real)
 * - Local HTTP server で `<audio>` 要素の英語音声を配信 (say コマンド生成)
 * - Popup page を起こして chrome.runtime.sendMessage 経由で start-source-session
 * - Relay 側 / SW 側 console を tail して WS 接続と session ライフサイクルを確認
 * - IndexedDB polling で transcript / translation が persist されるのを検証
 *
 * ## 既知の制限: `activeTab` 権限と tab capture
 *
 * MV3 の `chrome.tabCapture.getMediaStreamId` は `activeTab` 権限を必要とし、
 * **ユーザーが action icon をクリックした** タブに対してのみ grant される。
 * Playwright からは extension action icon を programmatic に click できず、
 * `activeTab` が grant されないため `getMediaStreamId` が "Extension has not
 * been invoked for the current page" で fail する。結果、本 E2E は:
 *
 * - **PASS できる**: relay-api 起動 / extension load / SW boot / default profile
 *   seed / popup 起動 / runtime message dispatch / session.start WS open 送信
 * - **FAIL / skip**: 実 audio data の tab capture → Deepgram 到達。オプショナル
 *   assertion として `PERAPERA_E2E_REQUIRE_TRANSCRIPT=1` を設定した場合のみ
 *   IndexedDB transcript を待つ (手動 activeTab 付与前提)
 *
 * 手動で transcript まで通すには、E2E 実行中に Playwright が起動した Chromium
 * window で **perapera の action icon を 1 回クリック** (popup.html を閉じて OK) し、
 * その session で再試験する方法がある。将来的には `chrome.debugger` API で
 * `Input.dispatchMouseEvent` を用いた programmatic invocation が考えられる。
 *
 * **実 API 料金を消費する**ため、CI ではスキップ。`PERAPERA_E2E_LIVE=1` を
 * 設定した環境のみ実行する。
 *
 * 実行例:
 *   # 1. Relay の .env.local に Deepgram + DeepL keys を設定
 *   # 2. 拡張を同じ ACCESS_TOKENS で build
 *   sh -c 'set -a; . packages/relay-api/.env.local; set +a; \
 *     PERAPERA_RELAY_API_BASE_URL=http://localhost:3001 \
 *     PERAPERA_RELAY_ACCESS_TOKEN=$(echo "$ACCESS_TOKENS" | cut -d, -f1) \
 *     pnpm --filter @perapera/extension build'
 *   # 3. 実行
 *   PERAPERA_E2E_LIVE=1 pnpm --filter @perapera/extension e2e --grep "golden path"
 */

const LIVE = process.env['PERAPERA_E2E_LIVE'] === '1';

const resolveExtensionId = async (
  context: BrowserContext,
): Promise<{ id: string; worker: Worker }> => {
  let worker = context.serviceWorkers()[0];
  worker ??= await context.waitForEvent('serviceworker');
  const url = worker.url();
  return { id: new URL(url).host, worker };
};

type StartSourceSessionInput = {
  sourceType: 'tab' | 'microphone' | 'desktop';
  displayName: string;
  sourceLanguage: string | null;
  autoDetectLanguage: boolean;
  targetLanguage: string;
  overlayTarget: { kind: 'tab'; tabId: number } | { kind: 'extension-monitor'; pageId: string };
};

type BackgroundResponse<T> =
  | { ok: true; value: T }
  | { ok: false; error: { type: string; message: string } };

test.describe('perapera golden path (live API, opt-in)', () => {
  test.skip(
    !LIVE,
    'set PERAPERA_E2E_LIVE=1 and ensure packages/relay-api/.env.local is configured',
  );
  test.setTimeout(180_000);

  let relay: RelayHandle;
  let fixtureServer: FixtureServerHandle;
  let context: BrowserContext;

  test.beforeAll(async () => {
    // 音声 fixture を macOS `say` で一度だけ生成 (test-speech.m4a)。
    // 既存ファイルがあれば reuse (build 時間短縮)。commit 対象外 (.gitignore 追加推奨)。
    const fixtureAudioPath = path.resolve(__dirname, '../fixtures/test-speech.m4a');
    if (!existsSync(fixtureAudioPath)) {
      try {
        execSync(
          `say -v Alex -r 150 --data-format=aac -o "${fixtureAudioPath}" ` +
            `"Hello world. This is a test of the perapera extension pipeline. ` +
            `The quick brown fox jumps over the lazy dog. ` +
            `One two three four five six seven eight nine ten. ` +
            `Audio capture service worker offscreen document relay gateway."`,
          { stdio: 'pipe' },
        );
        console.log('[golden-path] generated test-speech.m4a via `say`');
      } catch (cause) {
        console.warn(
          '[golden-path] `say` command unavailable; E2E will skip if audio fixture missing',
          cause,
        );
      }
    }

    relay = await spawnRelayDev();
    fixtureServer = await startFixtureServer();
    if (!fixtureServer.audioReady) {
      throw new Error(
        `audio fixture missing at ${fixtureAudioPath}. On macOS: ` +
          `say -v Alex -r 150 -o "${fixtureAudioPath}" "Hello world ..."`,
      );
    }
    context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--autoplay-policy=no-user-gesture-required',
        '--disable-blink-features=AutomationControlled',
      ],
      // TTS が動く環境を確保
      // eslint-disable-next-line @typescript-eslint/naming-convention
      ignoreDefaultArgs: ['--mute-audio'],
    });
  });

  test.afterAll(async () => {
    if (context !== undefined) await context.close();
    if (fixtureServer !== undefined) await fixtureServer.stop();
    if (relay !== undefined) await relay.stop();
  });

  test('audio page → SW start-source-session → Relay transcript/translation events', async () => {
    // 1. Extension SW を解決 (ensure() + profile seed の完了を少し待つ)
    const { id: extensionId, worker } = await resolveExtensionId(context);
    expect(extensionId).toMatch(/^[a-p]{32}$/);
    worker.on('console', (msg) => {
      const text = msg.text();
      if (
        text.includes('[session-command-service]') ||
        text.includes('[relay-gateway]') ||
        text.includes('[audio-frame-forward-receiver]') ||
        text.includes('[perapera]') ||
        text.includes('handleEvent failed') ||
        text.includes('[use-case')
      ) {
        console.log('[sw]', text);
      }
    });
    // offscreen document の console も拾えれば diagnostic に使える
    context.on('page', (page) => {
      if (page.url().includes('offscreen.html') || page.url().includes('offscreen')) {
        page.on('console', (msg) => {
          console.log('[offscreen]', msg.text());
        });
      }
    });
    await new Promise((r) => setTimeout(r, 500));

    // 2. SW から `chrome.tabs.create` で audio fixture を開く。Tab オブジェクトを
    //    直接得るので host_permissions 外 URL でも id が取れる (chrome.tabs.query
    //    経由では url/title が stripped されて URL ベース match ができない問題を回避)。
    const audioUrl = fixtureServer.url;
    const audioTabId = await worker.evaluate(async (url: string) => {
      const tab = await chrome.tabs.create({ url, active: true });
      return typeof tab.id === 'number' ? tab.id : null;
    }, audioUrl);
    expect(audioTabId, 'failed to open audio fixture tab via chrome.tabs.create').not.toBeNull();

    // 3. Playwright 側で audio page の再生状態を確認
    //    chrome.tabs.create で開いた page が Playwright の context.pages() に
    //    現れない場合があるため、open 後に少し待ってから取得
    await new Promise((r) => setTimeout(r, 1_500));
    const pages = context.pages();
    const audioPage = pages.find((p) => p.url().startsWith(audioUrl));
    if (audioPage === undefined) {
      console.log(
        '[golden-path] warn: audio page not in context.pages(); urls =',
        pages.map((p) => p.url()).join(', '),
      );
    } else {
      audioPage.on('console', (msg) => {
        if (msg.text().includes('[audio-fixture]')) {
          console.log('[audio-page]', msg.text());
        }
      });
      // Ensure audio is actually playing (tab capture requires active audio)
      await audioPage.locator('#status').waitFor({ state: 'attached', timeout: 10_000 });
      await audioPage.evaluate(() => {
        const a = document.querySelector<HTMLAudioElement>('#speech');
        if (a === null) return;
        a.muted = false;
        a.volume = 1.0;
        return a.play();
      });
      await audioPage
        .waitForFunction(
          () => {
            const a = document.querySelector<HTMLAudioElement>('#speech');
            return a !== null && !a.paused && a.currentTime > 0;
          },
          { timeout: 10_000 },
        )
        .catch(() =>
          console.log('[golden-path] warn: <audio> did not enter playing state within 10s'),
        );
    }

    // 4. Popup page を background 経由 dispatch の context として使う
    //    (chrome.runtime.sendMessage は同一 context の listener に routing されない
    //    ため、SW から SW へは send 不可。popup は別 context なので通る。)
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
    await popupPage.locator('#root > *').first().waitFor({ timeout: 10_000 });

    const startInput: StartSourceSessionInput = {
      sourceType: 'tab',
      displayName: 'E2E speech fixture',
      sourceLanguage: 'en-US',
      autoDetectLanguage: false,
      targetLanguage: 'ja-JP',
      overlayTarget: { kind: 'tab', tabId: audioTabId as number },
    };
    const startResponse = await popupPage.evaluate(
      async (input) =>
        (await chrome.runtime.sendMessage({
          type: 'command.start-source-session',
          input,
        })) as BackgroundResponse<{ sessionId: string; state: string; startedAt: string }>,
      startInput,
    );
    expect(startResponse.ok, `start-source-session failed: ${JSON.stringify(startResponse)}`).toBe(
      true,
    );

    // 5-7. Relay stdout assertions は spawn 時のみ (reused = 既存 dev server の stdout 掴めない)
    if (!relay.reused) {
      await relay.waitFor(/audio\.frame received \(sample\)/, 30_000);
      await relay.waitFor(
        /emit transcript\.(partial|final)|transcript\s*[\.:]?\s*(partial|final)/i,
        60_000,
      );
      await relay.waitFor(/translation\.final|translation succeeded/i, 60_000);
    }

    // 8. 拡張側 IndexedDB に transcript segment が persist されたか確認 (polling)
    const sessionId = startResponse.ok ? startResponse.value.sessionId : '';
    expect(sessionId).not.toBe('');

    // IndexedDB polling (SW から). activeTab 権限が取れない環境では transcript は
    // 永久に届かないので、assertion を opt-in にして CI / routine run では
    // soft check に留める。`PERAPERA_E2E_REQUIRE_TRANSCRIPT=1` を設定した場合のみ
    // 厳格 assert。
    const requireTranscript = process.env['PERAPERA_E2E_REQUIRE_TRANSCRIPT'] === '1';
    const pollStart = Date.now();
    const POLL_TIMEOUT_MS = requireTranscript ? 90_000 : 10_000;
    const POLL_INTERVAL_MS = 2_000;
    let storedSummary: { segmentCount: number; translationCount: number } = {
      segmentCount: 0,
      translationCount: 0,
    };
    while (Date.now() - pollStart < POLL_TIMEOUT_MS) {
      storedSummary = await worker.evaluate(async (sid: string) => {
        try {
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const req = indexedDB.open('perapera');
            req.onsuccess = (): void => {
              resolve(req.result);
            };
            req.onerror = (): void => {
              reject(req.error);
            };
          });
          const read = <T>(store: string, indexName: string, key: string): Promise<T[]> =>
            new Promise((resolve, reject) => {
              const tx = db.transaction(store, 'readonly');
              const idx = tx.objectStore(store).index(indexName);
              const req = idx.getAll(key);
              req.onsuccess = (): void => {
                resolve(req.result as T[]);
              };
              req.onerror = (): void => {
                reject(req.error);
              };
            });
          const segments = await read<unknown>('transcript_segments', 'by-sessionId', sid);
          const translations = await read<unknown>('translation_segments', 'by-sessionId', sid);
          db.close();
          return { segmentCount: segments.length, translationCount: translations.length };
        } catch {
          return { segmentCount: 0, translationCount: 0 };
        }
      }, sessionId);
      if (storedSummary.segmentCount > 0) break;
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    console.log(
      `[golden-path] stored: ${String(storedSummary.segmentCount)} segments, ` +
        `${String(storedSummary.translationCount)} translations ` +
        `(requireTranscript=${String(requireTranscript)})`,
    );
    if (requireTranscript) {
      expect(
        storedSummary.segmentCount,
        `transcript_segments for session ${sessionId} never appeared in IndexedDB within ${String(
          POLL_TIMEOUT_MS,
        )}ms. ` + `Manually click the perapera action icon during E2E run to grant activeTab.`,
      ).toBeGreaterThan(0);
    }

    // 9. stop (popup context 経由)
    await popupPage.evaluate(
      async (sid: string) =>
        chrome.runtime.sendMessage({
          type: 'command.stop-source-session',
          input: { sessionId: sid },
        }),
      sessionId,
    );
  });
});
