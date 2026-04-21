import { okAsync } from 'neverthrow';
import { afterAll, describe, expect, it } from 'vitest';
import { type IssueStreamTokenUseCase } from '../src/application/use-cases/issue-stream-token-use-case';
import { buildApp } from '../src/presentation/http/server';

const noopUseCase: IssueStreamTokenUseCase = () =>
  okAsync({
    sessionId: '01HZX8Y1R8M7D3Q2P4T5V6W7A1',
    streamToken: 'jwt',
    relayUrl: 'wss://test/relay',
    expiresAt: '2026-04-21T01:00:00.000Z',
    heartbeatIntervalSec: 15,
    audio: {
      encoding: 'pcm_s16le',
      sampleRateHz: 16000,
      channels: 1,
      frameDurationMs: 100,
      transport: 'json-base64',
    },
    limits: { maxConcurrentSessions: 3, maxFrameRatePerSecond: 10 },
  });

const app = buildApp({ issueStreamTokenUseCase: noopUseCase });

afterAll(async () => {
  await app.close();
});

describe('relay-api smoke', () => {
  it('GET /health returns ok', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    const body: unknown = response.json();
    expect(body).toMatchObject({
      data: {
        status: 'ok',
        service: 'relay-api',
      },
    });
  });
});
