import type { LoggerOptions } from 'pino';

const isDevelopment = process.env['NODE_ENV'] !== 'production';

const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  '*.apiKey',
  '*.streamToken',
  '*.accessToken',
  '*.refreshToken',
  '*.password',
  'payload.audioBase64',
  'payload.text',
];

const developmentTransport = {
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:HH:MM:ss.l',
      ignore: 'pid,hostname,service',
    },
  },
} satisfies Pick<LoggerOptions, 'transport'>;

export const loggerOptions: LoggerOptions = {
  level: process.env['LOG_LEVEL'] ?? 'info',
  redact: {
    paths: redactPaths,
    censor: '[REDACTED]',
    remove: false,
  },
  base: {
    service: 'perapera-relay-api',
  },
  ...(isDevelopment ? developmentTransport : {}),
};
