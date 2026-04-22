import { describe, expect, it } from 'vitest';
import { createLanguagePair } from '../../domain/session/language-pair';
import { createSourceSession, type SourceSession } from '../../domain/session/source-session';
import {
  createDefaultWsEndpointBuilder,
  createFetchStreamTokenIssuer,
} from './fetch-stream-token-issuer';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const SOURCE_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7B1';

const buildSession = (): SourceSession =>
  createSourceSession({
    sessionIdentifier: SESSION_ID,
    sourceIdentifier: SOURCE_ID,
    sourceType: 'tab',
    languagePair: createLanguagePair({ source: 'en-US', target: 'ja-JP' })._unsafeUnwrap(),
    startedAt: '2026-04-21T00:00:00.000Z',
  })._unsafeUnwrap();

const createFakeResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('createFetchStreamTokenIssuer (IMPL-319, DD-401)', () => {
  it('sends POST /sessions with the expected payload and returns streamToken', async () => {
    const capturedRequests: { url: string; init: RequestInit | undefined }[] = [];
    const normalizeUrl = (url: RequestInfo | URL): string => {
      if (typeof url === 'string') return url;
      if (url instanceof URL) return url.toString();
      return url.url;
    };
    const issuer = createFetchStreamTokenIssuer({
      baseUrl: 'https://relay.test',
      accessToken: 'secret-token',
      extensionVersion: '0.1.0',
      protocolVersion: '1.0',
      resolveDisplayName: () => 'Example Tab',
      resolveOverlayTarget: () => ({ kind: 'tab', tabId: 42 }),
      resolveAutoDetectLanguage: () => false,
      fetchImpl: (url, init) => {
        capturedRequests.push({
          url: normalizeUrl(url),
          init,
        });
        return Promise.resolve(
          createFakeResponse({
            sessionId: SESSION_ID,
            streamToken: 'jwt.stream.token',
            relayUrl: 'wss://relay.test/api/v1/relay',
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
          }),
        );
      },
    });

    const result = await issuer(buildSession());
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe('jwt.stream.token');
    }
    expect(capturedRequests).toHaveLength(1);
    const req = capturedRequests[0];
    expect(req?.url).toBe('https://relay.test/sessions');
    expect(req?.init?.method).toBe('POST');
    expect(req?.init?.headers).toMatchObject({
      authorization: 'Bearer secret-token',
    });
    const rawBody: unknown = req?.init?.body;
    if (typeof rawBody !== 'string') throw new Error('body must be string');
    const body: unknown = JSON.parse(rawBody);
    expect(body).toMatchObject({
      sourceType: 'tab',
      displayName: 'Example Tab',
      sourceLanguage: 'en-US',
      autoDetectLanguage: false,
      targetLanguage: 'ja-JP',
      overlayTarget: { kind: 'tab', tabId: 42 },
      client: { extensionVersion: '0.1.0', protocolVersion: '1.0' },
    });
  });

  it('sends sourceLanguage=null when autoDetectLanguage is true', async () => {
    let captured: unknown = null;
    const issuer = createFetchStreamTokenIssuer({
      baseUrl: 'https://relay.test',
      accessToken: 'secret-token',
      extensionVersion: '0.1.0',
      protocolVersion: '1.0',
      resolveDisplayName: () => 'n',
      resolveOverlayTarget: () => ({ kind: 'extension-monitor', pageId: 'monitor' }),
      resolveAutoDetectLanguage: () => true,
      fetchImpl: (_url, init) => {
        const body: unknown = init?.body;
        captured = typeof body === 'string' ? JSON.parse(body) : body;
        return Promise.resolve(
          createFakeResponse({
            sessionId: SESSION_ID,
            streamToken: 't',
            relayUrl: 'w',
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
          }),
        );
      },
    });
    await issuer(buildSession());
    expect(captured).toMatchObject({
      sourceLanguage: null,
      autoDetectLanguage: true,
    });
  });

  it('returns invariantViolationError on non-2xx response', async () => {
    const issuer = createFetchStreamTokenIssuer({
      baseUrl: 'https://relay.test',
      accessToken: 'secret-token',
      extensionVersion: '0.1.0',
      protocolVersion: '1.0',
      resolveDisplayName: () => 'n',
      resolveOverlayTarget: () => ({ kind: 'extension-monitor', pageId: 'monitor' }),
      resolveAutoDetectLanguage: () => false,
      fetchImpl: () => Promise.resolve(new Response('unauthorized', { status: 401 })),
    });
    const result = await issuer(buildSession());
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.kind).toBe('invariant-violation');
      if (result.error.kind === 'invariant-violation') {
        expect(result.error.invariant).toBe('stream-token-fetch');
        expect(result.error.details).toMatch(/non-2xx/);
      }
    }
  });

  it('returns invariantViolationError on network failure', async () => {
    const issuer = createFetchStreamTokenIssuer({
      baseUrl: 'https://relay.test',
      accessToken: 'secret-token',
      extensionVersion: '0.1.0',
      protocolVersion: '1.0',
      resolveDisplayName: () => 'n',
      resolveOverlayTarget: () => ({ kind: 'extension-monitor', pageId: 'monitor' }),
      resolveAutoDetectLanguage: () => false,
      fetchImpl: () => Promise.reject(new Error('TCP reset')),
    });
    const result = await issuer(buildSession());
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.kind).toBe('invariant-violation');
      if (result.error.kind === 'invariant-violation') {
        expect(result.error.details).toMatch(/TCP reset/);
      }
    }
  });

  it('returns invariantViolationError when response schema is invalid', async () => {
    const issuer = createFetchStreamTokenIssuer({
      baseUrl: 'https://relay.test',
      accessToken: 'secret-token',
      extensionVersion: '0.1.0',
      protocolVersion: '1.0',
      resolveDisplayName: () => 'n',
      resolveOverlayTarget: () => ({ kind: 'extension-monitor', pageId: 'monitor' }),
      resolveAutoDetectLanguage: () => false,
      fetchImpl: () => Promise.resolve(createFakeResponse({ hello: 'world' })),
    });
    const result = await issuer(buildSession());
    expect(result.isErr()).toBe(true);
  });
});

describe('createDefaultWsEndpointBuilder', () => {
  it('converts https base URL into wss endpoint with query parameters', () => {
    const builder = createDefaultWsEndpointBuilder({ baseUrl: 'https://relay.test' });
    const url = builder(SESSION_ID, 'secret-token');
    expect(url).toBe(`wss://relay.test/api/v1/relay?token=secret-token&sessionId=${SESSION_ID}`);
  });

  it('converts http base URL into ws endpoint', () => {
    const builder = createDefaultWsEndpointBuilder({ baseUrl: 'http://localhost:3001' });
    const url = builder(SESSION_ID, 't');
    expect(url.startsWith('ws://localhost:3001/api/v1/relay?')).toBe(true);
  });

  it('respects custom wsPath override', () => {
    const builder = createDefaultWsEndpointBuilder({
      baseUrl: 'https://relay.test',
      wsPath: '/stream',
    });
    const url = builder(SESSION_ID, 't');
    expect(url.startsWith('wss://relay.test/stream?')).toBe(true);
  });

  it('urlencodes token and sessionId', () => {
    const builder = createDefaultWsEndpointBuilder({ baseUrl: 'https://relay.test' });
    const url = builder('sess/ion id', 'tok&en');
    expect(url).toContain('token=tok%26en');
    expect(url).toContain('sessionId=sess%2Fion%20id');
  });
});
