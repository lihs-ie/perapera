import type { LoggerOptions } from 'pino';

const isDevelopment = process.env['NODE_ENV'] !== 'production';

/**
 * pino redact 対象パス (IMPL-450)。
 *
 * 機密性の観点:
 * - 認証 token / API key: production で payload に入った場合を想定し広くカバー
 * - 字幕本文 (`payload.text` / `payload.audioBase64`): プライバシー保護のため
 *   content を残さず、存在の事実のみログに出す
 * - Deepgram / DeepL 固有ヘッダ: provider adapter 内でリクエスト情報を log に
 *   出した際の漏洩を防ぐ
 *
 * pino redact 構文:
 * - `a.b.c`: path 一致
 * - `*.foo`: 任意 1 階層下の `foo`
 * - `*.*.foo`: 任意 2 階層下の `foo`
 * - `a[*].b`: 配列要素
 */
const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'req.headers["x-deepgram-authorization"]',
  'req.headers["x-deepl-auth"]',
  'res.headers["set-cookie"]',
  '*.apiKey',
  '*.streamToken',
  '*.accessToken',
  '*.refreshToken',
  '*.password',
  '*.authorization',
  '*.audioBase64',
  'payload.audioBase64',
  'payload.text',
  'payload.*.text',
  'event.payload.text',
  'event.payload.audioBase64',
  'body.payload.audioBase64',
  'body.payload.text',
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
