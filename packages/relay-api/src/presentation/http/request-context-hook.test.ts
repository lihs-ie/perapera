import Fastify from 'fastify';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { registerRequestContextHook } from './request-context-hook';

const collectOutput = (stream: PassThrough): (() => string) => {
  const chunks: Buffer[] = [];
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));
  return () => Buffer.concat(chunks).toString('utf8');
};

const parseProbeLines = (output: string): unknown[] =>
  output
    .split('\n')
    .filter((line) => line.includes('"msg":"probed"'))
    .map((line): unknown => JSON.parse(line));

const buildAppWithHook = () => {
  const stream = new PassThrough();
  const read = collectOutput(stream);
  const app = Fastify({ logger: { level: 'info', stream } });
  registerRequestContextHook(app);
  app.get('/probe', (request, _reply) => {
    request.log.info('probed');
    return { ok: true };
  });
  return { app, read };
};

const waitForLog = (): Promise<void> => new Promise((resolve) => setImmediate(() => resolve()));

describe('registerRequestContextHook (IMPL-451)', () => {
  it('adds sessionId to request.log when query contains sessionId', async () => {
    const { app, read } = buildAppWithHook();
    try {
      await app.inject({ method: 'GET', url: '/probe?sessionId=sess_TEST_01' });
      await waitForLog();
      const probeLines = parseProbeLines(read());
      expect(probeLines.length).toBeGreaterThan(0);
      expect(probeLines[0]).toMatchObject({ sessionId: 'sess_TEST_01' });
    } finally {
      await app.close();
    }
  });

  it('does not add sessionId to request.log when query has no sessionId', async () => {
    const { app, read } = buildAppWithHook();
    try {
      await app.inject({ method: 'GET', url: '/probe' });
      await waitForLog();
      const probeLines = parseProbeLines(read());
      expect(probeLines.length).toBeGreaterThan(0);
      const first = probeLines[0];
      const hasSessionId = typeof first === 'object' && first !== null && 'sessionId' in first;
      expect(hasSessionId).toBe(false);
    } finally {
      await app.close();
    }
  });

  it('falls back cleanly when sessionId query is empty string', async () => {
    const { app, read } = buildAppWithHook();
    try {
      await app.inject({ method: 'GET', url: '/probe?sessionId=' });
      await waitForLog();
      const probeLines = parseProbeLines(read());
      const first = probeLines[0];
      const hasSessionId = typeof first === 'object' && first !== null && 'sessionId' in first;
      expect(hasSessionId).toBe(false);
    } finally {
      await app.close();
    }
  });
});
