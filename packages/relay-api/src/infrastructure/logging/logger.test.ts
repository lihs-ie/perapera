import pino from 'pino';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { loggerOptions } from './logger';

/**
 * IMPL-450 redact 契約検証。
 *
 * pino は `redact` で指定されたパスを censor 文字列に置換する。本テストは
 * `loggerOptions` を実際に pino インスタンスへ注入し、JSON 出力を captureして
 * 各 path が `[REDACTED]` になっていること / 字幕本文が平文で残らないこと
 * を確認する。
 */

const captureLogLine = (fn: (logger: pino.Logger) => void): unknown => {
  const stream = new PassThrough();
  const chunks: Buffer[] = [];
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));
  // development transport は別スレッドで動くため、test ではそれを除外して
  // stream に直接書かせる
  const { transport: _ignoreTransport, ...restOptions } = loggerOptions;
  const logger = pino(restOptions, stream);
  fn(logger);
  logger.flush();
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  const lines = raw.length === 0 ? [] : raw.split('\n').filter((line) => line.length > 0);
  const last = lines.at(-1);
  if (last === undefined) return {};
  return JSON.parse(last);
};

describe('loggerOptions redact contract (IMPL-450)', () => {
  it('redacts Authorization header at req.headers.authorization', () => {
    const line = captureLogLine((logger) => {
      logger.info({ req: { headers: { authorization: 'Bearer super-secret-token' } } }, 'request');
    });
    expect(line).toMatchObject({ req: { headers: { authorization: '[REDACTED]' } } });
  });

  it('redacts x-api-key header', () => {
    const line = captureLogLine((logger) => {
      logger.info({ req: { headers: { 'x-api-key': 'abcd1234' } } }, 'request');
    });
    expect(line).toMatchObject({ req: { headers: { 'x-api-key': '[REDACTED]' } } });
  });

  it('redacts Deepgram and DeepL specific auth headers', () => {
    const line = captureLogLine((logger) => {
      logger.info(
        {
          req: {
            headers: {
              'x-deepgram-authorization': 'Token dg-secret',
              'x-deepl-auth': 'DeepL-Auth-Key deepl-secret',
            },
          },
        },
        'request',
      );
    });
    expect(line).toMatchObject({
      req: {
        headers: {
          'x-deepgram-authorization': '[REDACTED]',
          'x-deepl-auth': '[REDACTED]',
        },
      },
    });
  });

  it('redacts apiKey / streamToken / accessToken / refreshToken / password under any object', () => {
    const line = captureLogLine((logger) => {
      logger.info(
        {
          context: {
            apiKey: 'secret-api',
            streamToken: 'jwt.a.b.c',
            accessToken: 'access-secret',
            refreshToken: 'refresh-secret',
            password: 'raw-password',
          },
        },
        'credentials',
      );
    });
    expect(line).toMatchObject({
      context: {
        apiKey: '[REDACTED]',
        streamToken: '[REDACTED]',
        accessToken: '[REDACTED]',
        refreshToken: '[REDACTED]',
        password: '[REDACTED]',
      },
    });
  });

  it('redacts transcript text at payload.text (privacy)', () => {
    const line = captureLogLine((logger) => {
      logger.info(
        { payload: { text: 'hello world — sensitive transcript content' } },
        'transcript',
      );
    });
    expect(line).toMatchObject({ payload: { text: '[REDACTED]' } });
  });

  it('redacts audio frame binary at payload.audioBase64 (privacy + size)', () => {
    const line = captureLogLine((logger) => {
      logger.info({ payload: { audioBase64: 'AAAA='.repeat(1000) } }, 'audio.frame');
    });
    expect(line).toMatchObject({ payload: { audioBase64: '[REDACTED]' } });
  });

  it('redacts event.payload.text and event.payload.audioBase64 (wrapped envelope)', () => {
    const line = captureLogLine((logger) => {
      logger.info(
        {
          event: {
            payload: {
              text: 'should not leak',
              audioBase64: 'AAAA=',
            },
          },
        },
        'dispatching',
      );
    });
    expect(line).toMatchObject({
      event: {
        payload: {
          text: '[REDACTED]',
          audioBase64: '[REDACTED]',
        },
      },
    });
  });

  it('keeps non-sensitive fields visible (sessionId / requestId remain)', () => {
    const line = captureLogLine((logger) => {
      logger.info(
        {
          sessionId: 'sess_01ABC',
          requestId: 'req_01DEF',
          payload: { chunkId: 'chk_000001' },
        },
        'routine log',
      );
    });
    expect(line).toMatchObject({
      sessionId: 'sess_01ABC',
      requestId: 'req_01DEF',
      payload: { chunkId: 'chk_000001' },
    });
  });
});
