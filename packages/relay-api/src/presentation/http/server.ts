import Fastify, { type FastifyInstance } from 'fastify';
import { loggerOptions } from '../../infrastructure/logging/logger';
import { registerHealthRoute } from './routes/health';

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: loggerOptions,
    disableRequestLogging: false,
    trustProxy: true,
  });

  registerHealthRoute(app);

  return app;
}

async function start(): Promise<void> {
  const app = buildApp();

  const port = Number.parseInt(process.env['PORT'] ?? '3001', 10);
  const host = process.env['HOST'] ?? '0.0.0.0';

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutdown signal received, closing server');
    try {
      await app.close();
      process.exit(0);
    } catch (error) {
      app.log.error({ error }, 'error during graceful shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  try {
    await app.listen({ port, host });
  } catch (error) {
    app.log.error({ error }, 'failed to start server');
    process.exit(1);
  }
}

const isEntry = import.meta.url === `file://${process.argv[1]}`;
if (isEntry) {
  void start();
}
