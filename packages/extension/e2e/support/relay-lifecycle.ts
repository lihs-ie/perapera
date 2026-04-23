import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../..');
const relayEnvPath = path.resolve(repoRoot, 'packages/relay-api/.env.local');

const DEFAULT_HEALTH_URL = 'http://localhost:3001/health';

const probeHealth = async (url: string): Promise<boolean> => {
  try {
    const res = await fetch(url, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
};

export type RelayHandle = Readonly<{
  /** 既存のサーバを reuse しているか (spawn した場合 false) */
  reused: boolean;
  /** spawn した場合のみ child process */
  child: ChildProcessWithoutNullStreams | null;
  /** 受信済 stdout/stderr 行全体 (spawn 時のみ) */
  output: string[];
  /** 指定 regex に match する行を待機 (spawn 時のみ useful) */
  waitFor: (pattern: RegExp, timeoutMs: number) => Promise<string>;
  /** process を stop。reuse 時は no-op */
  stop: () => Promise<void>;
}>;

/**
 * Relay API dev server を準備する。
 *
 * - 既に http://localhost:3001/health が 200 を返していれば **reuse** する
 *   (`pnpm --filter @perapera/relay-api dev` が別ターミナルで走っているケース)。
 *   stdout assertions は使えないが、健康な dev server を壊さない。
 * - 動いていなければ `.env.local` を shell で source して新規 spawn する。
 *   `DEEPGRAM_API_KEY` / `DEEPL_API_KEY` の値はテストコードが一切触れず
 *   子プロセス環境変数で直接 Relay に渡される。
 *
 * stdout/stderr は全て `output` 配列に集約し、`waitFor(regex, timeout)` で
 * 任意の pino line を待機できる (spawn 時のみ)。
 */
export const spawnRelayDev = async (): Promise<RelayHandle> => {
  if (await probeHealth(DEFAULT_HEALTH_URL)) {
    // reuse path
    console.log('[relay-lifecycle] reusing existing dev server at localhost:3001');
    return {
      reused: true,
      child: null,
      output: [],
      waitFor: (_pattern, _timeout) =>
        Promise.reject(
          new Error(
            'waitFor is not supported when Relay is reused (existing server; stdout is not captured)',
          ),
        ),
      stop: () => Promise.resolve(),
    };
  }

  return spawnRelayDevImpl();
};

const spawnRelayDevImpl = async (): Promise<RelayHandle> => {
  const output: string[] = [];
  const listeners: Array<{ pattern: RegExp; resolve: (match: string) => void }> = [];

  const onLine = (line: string): void => {
    output.push(line);
    for (let i = listeners.length - 1; i >= 0; i -= 1) {
      const entry = listeners[i];
      if (entry !== undefined && entry.pattern.test(line)) {
        listeners.splice(i, 1);
        entry.resolve(line);
      }
    }
  };

  const attachStream = (stream: NodeJS.ReadableStream): void => {
    let buffer = '';
    stream.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf-8');
      let idx: number;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        onLine(line);
      }
    });
  };

  // `sh -c 'set -a; source .env.local; set +a; exec pnpm --filter @perapera/relay-api dev'`
  // shell-sourcing は子プロセスだけに env を渡し、Node の process.env を汚さない。
  const child = spawn(
    'sh',
    ['-c', `set -a; . "${relayEnvPath}"; set +a; exec pnpm --filter @perapera/relay-api dev`],
    {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  attachStream(child.stdout);
  attachStream(child.stderr);
  child.on('exit', (code, signal) => {
    onLine(`[relay-dev exited code=${String(code)} signal=${String(signal)}]`);
  });

  const waitFor = (pattern: RegExp, timeoutMs: number): Promise<string> =>
    new Promise((resolve, reject) => {
      const existing = output.find((line) => pattern.test(line));
      if (existing !== undefined) {
        resolve(existing);
        return;
      }
      const entry = { pattern, resolve };
      listeners.push(entry);
      const timer = setTimeout(() => {
        const idx = listeners.indexOf(entry);
        if (idx >= 0) listeners.splice(idx, 1);
        reject(
          new Error(
            `Timeout (${String(timeoutMs)}ms) waiting for pattern ${String(pattern)} in relay stdout. ` +
              `Last ${String(Math.min(20, output.length))} lines:\n` +
              output.slice(-20).join('\n'),
          ),
        );
      }, timeoutMs);
      entry.resolve = (match) => {
        clearTimeout(timer);
        resolve(match);
      };
    });

  // Wait for "Server listening" pino log (api starts successfully)
  await waitFor(/Server listening/i, 20000);

  const stop = async (): Promise<void> => {
    if (child.killed) return;
    child.kill('SIGTERM');
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL');
        resolve();
      }, 3000);
      child.on('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  };

  return { reused: false, child, output, waitFor, stop };
};
