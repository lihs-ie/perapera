import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/presentation/http/server';

const app = buildApp();

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
