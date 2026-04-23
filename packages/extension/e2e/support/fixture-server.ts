import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const audioPageFile = path.resolve(__dirname, '../fixtures/audio-page.html');
const audioFixtureFile = path.resolve(__dirname, '../fixtures/test-speech.m4a');

export type FixtureServerHandle = Readonly<{
  port: number;
  url: string;
  audioReady: boolean;
  stop: () => Promise<void>;
}>;

/**
 * audio-page.html + test-speech.aiff を返す最小 HTTP server。
 *
 * `test-speech.aiff` は macOS `say` で事前生成されたファイル (git 追跡外)。
 * 存在しない場合 E2E spec が beforeAll で生成を試みる。
 * 欠けている場合でも server は起動し `audioReady: false` で示す。
 */
export const startFixtureServer = (): Promise<FixtureServerHandle> => {
  const html = readFileSync(audioPageFile, 'utf-8');
  const audioReady = existsSync(audioFixtureFile);
  const audio = audioReady ? readFileSync(audioFixtureFile) : Buffer.from([]);

  const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/index.html') {
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      });
      res.end(html);
      return;
    }
    if (req.url === '/speech.m4a') {
      if (!audioReady) {
        res.writeHead(404);
        res.end('speech fixture missing');
        return;
      }
      res.writeHead(200, {
        'content-type': 'audio/mp4',
        'content-length': String(audio.length),
        'cache-control': 'no-store',
      });
      res.end(audio);
      return;
    }
    res.writeHead(404);
    res.end('not found');
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr === null || typeof addr === 'string') {
        throw new Error('fixture server: invalid address');
      }
      const port = addr.port;
      resolve({
        port,
        url: `http://127.0.0.1:${String(port)}/`,
        audioReady,
        stop: () =>
          new Promise<void>((resolveStop) => {
            server.close(() => {
              resolveStop();
            });
          }),
      });
    });
  });
};
