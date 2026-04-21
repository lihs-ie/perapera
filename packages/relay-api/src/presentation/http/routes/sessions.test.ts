import { err, errAsync, ok, okAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import { type AccessTokenVerifier } from '../../../application/ports/access-token-verifier';
import { type JwtVerifier } from '../../../application/ports/jwt-verifier';
import { type IssueStreamTokenOutput } from '../../../application/dto/issue-stream-token-dto';
import { type IssueStreamTokenUseCase } from '../../../application/use-cases/issue-stream-token-use-case';
import {
  invariantViolationError,
  validationError,
  type DomainError,
} from '../../../domain/shared/errors';
import { buildApp } from '../server';

const VALID_ACCESS_TOKEN = 'access-token-test-fixture-aaaa';

const noopVerifier: JwtVerifier = {
  verify: () =>
    okAsync({
      jti: 'strm_xxx',
      sub: '01HZX8Y1R8M7D3Q2P4T5V6W7A1',
      expiresAtEpochSec: Math.floor(Date.now() / 1000) + 600,
      issuedAtEpochSec: Math.floor(Date.now() / 1000),
      claims: {},
    }),
};

const buildAccessTokenVerifier = (expected = VALID_ACCESS_TOKEN): AccessTokenVerifier => ({
  verify: (bearer) =>
    bearer === expected
      ? ok<void, DomainError>(undefined)
      : err<void, DomainError>(
          invariantViolationError({
            invariant: 'access-token-invalid',
            details: 'mismatch',
          }),
        ),
});

const buildTestApp = (issueStreamTokenUseCase: IssueStreamTokenUseCase) =>
  buildApp({
    issueStreamTokenUseCase,
    jwtVerifier: noopVerifier,
    accessTokenVerifier: buildAccessTokenVerifier(),
  });

const authHeaders = (token = VALID_ACCESS_TOKEN) => ({ authorization: `Bearer ${token}` });

const successOutput: IssueStreamTokenOutput = {
  sessionId: '01HZX8Y1R8M7D3Q2P4T5V6W7A1',
  streamToken: 'eyJhbGciOi.jwt.string',
  relayUrl: 'wss://relay.example.com/api/v1/relay',
  expiresAt: '2026-04-21T00:30:00.000Z',
  heartbeatIntervalSec: 15,
  audio: {
    encoding: 'pcm_s16le',
    sampleRateHz: 16000,
    channels: 1,
    frameDurationMs: 100,
    transport: 'json-base64',
  },
  limits: {
    maxConcurrentSessions: 3,
    maxFrameRatePerSecond: 10,
  },
};

const validBody = {
  sourceType: 'tab',
  displayName: 'YouTube Live',
  sourceLanguage: 'en-US',
  autoDetectLanguage: false,
  targetLanguage: 'ja-JP',
  overlayTarget: { kind: 'tab', tabId: 42 },
  client: { extensionVersion: '0.1.0', protocolVersion: '1.0' },
};

describe('POST /sessions route (IMPL-411, stateless)', () => {
  it('returns 201 with data + meta on success', async () => {
    const useCase: IssueStreamTokenUseCase = vi.fn(() =>
      okAsync<IssueStreamTokenOutput, DomainError>(successOutput),
    );
    const app = buildTestApp(useCase);
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/sessions',
        headers: authHeaders(),
        payload: validBody,
      });
      expect(response.statusCode).toBe(201);
      const parsed: unknown = response.json();
      expect(parsed).toMatchObject({
        data: { sessionId: '01HZX8Y1R8M7D3Q2P4T5V6W7A1' },
      });
      expect(useCase).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });

  it('returns requestId in meta with req_ prefix', async () => {
    const useCase: IssueStreamTokenUseCase = () =>
      okAsync<IssueStreamTokenOutput, DomainError>(successOutput);
    const app = buildTestApp(useCase);
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/sessions',
        headers: authHeaders(),
        payload: validBody,
      });
      const parsed: unknown = response.json();
      const hasReqId =
        typeof parsed === 'object' &&
        parsed !== null &&
        'meta' in parsed &&
        typeof parsed.meta === 'object' &&
        parsed.meta !== null &&
        'requestId' in parsed.meta &&
        typeof parsed.meta.requestId === 'string' &&
        parsed.meta.requestId.startsWith('req_');
      expect(hasReqId).toBe(true);
    } finally {
      await app.close();
    }
  });

  it('returns 400 VALIDATION_ERROR for validation failure', async () => {
    const useCase: IssueStreamTokenUseCase = () =>
      errAsync<IssueStreamTokenOutput, DomainError>(
        validationError({ field: 'displayName', message: 'must be non-empty' }),
      );
    const app = buildTestApp(useCase);
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/sessions',
        headers: authHeaders(),
        payload: { ...validBody, displayName: '' },
      });
      expect(response.statusCode).toBe(400);
      const parsed: unknown = response.json();
      expect(parsed).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    } finally {
      await app.close();
    }
  });

  it('returns 400 INVARIANT_VIOLATION for invariant errors', async () => {
    const useCase: IssueStreamTokenUseCase = () =>
      errAsync<IssueStreamTokenOutput, DomainError>(
        invariantViolationError({ invariant: 'x', details: 'y' }),
      );
    const app = buildTestApp(useCase);
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/sessions',
        headers: authHeaders(),
        payload: validBody,
      });
      expect(response.statusCode).toBe(400);
      const parsed: unknown = response.json();
      expect(parsed).toMatchObject({ error: { code: 'INVARIANT_VIOLATION' } });
    } finally {
      await app.close();
    }
  });

  it('returns 401 UNAUTHORIZED when Authorization is missing (IMPL-430)', async () => {
    const useCase = vi.fn<IssueStreamTokenUseCase>(() =>
      okAsync<IssueStreamTokenOutput, DomainError>(successOutput),
    );
    const app = buildTestApp(useCase);
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/sessions',
        payload: validBody,
      });
      expect(response.statusCode).toBe(401);
      const parsed: unknown = response.json();
      expect(parsed).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
      expect(useCase).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('returns 401 UNAUTHORIZED when access token is invalid (IMPL-430)', async () => {
    const useCase = vi.fn<IssueStreamTokenUseCase>(() =>
      okAsync<IssueStreamTokenOutput, DomainError>(successOutput),
    );
    const app = buildTestApp(useCase);
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/sessions',
        headers: authHeaders('wrong-token-xxxxxxxxxxxxxxxxx'),
        payload: validBody,
      });
      expect(response.statusCode).toBe(401);
      const parsed: unknown = response.json();
      expect(parsed).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
      expect(useCase).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('returns 401 UNAUTHORIZED when Authorization scheme is not Bearer', async () => {
    const useCase = vi.fn<IssueStreamTokenUseCase>(() =>
      okAsync<IssueStreamTokenOutput, DomainError>(successOutput),
    );
    const app = buildTestApp(useCase);
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/sessions',
        headers: { authorization: `Basic ${VALID_ACCESS_TOKEN}` },
        payload: validBody,
      });
      expect(response.statusCode).toBe(401);
      expect(useCase).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
