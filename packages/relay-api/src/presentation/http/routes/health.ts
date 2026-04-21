import type { FastifyInstance } from 'fastify';

const SERVICE_NAME = 'relay-api';
const SERVICE_VERSION = '0.0.0';

export function registerHealthRoute(app: FastifyInstance): void {
  app.get('/health', () => ({
    data: {
      status: 'ok',
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      serverTime: new Date().toISOString(),
    },
  }));
}
