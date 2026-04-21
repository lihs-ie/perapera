import { errAsync, okAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import { type IssueStreamTokenOutput } from '../../../application/dto/issue-stream-token-dto';
import { type IssueStreamTokenUseCase } from '../../../application/use-cases/issue-stream-token-use-case';
import {
  invariantViolationError,
  validationError,
  type DomainError,
} from '../../../domain/shared/errors';
import { buildApp } from '../server';

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
    const app = buildApp({ issueStreamTokenUseCase: useCase });
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/sessions',
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
    const app = buildApp({ issueStreamTokenUseCase: useCase });
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/sessions',
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
    const app = buildApp({ issueStreamTokenUseCase: useCase });
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/sessions',
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
    const app = buildApp({ issueStreamTokenUseCase: useCase });
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/sessions',
        payload: validBody,
      });
      expect(response.statusCode).toBe(400);
      const parsed: unknown = response.json();
      expect(parsed).toMatchObject({ error: { code: 'INVARIANT_VIOLATION' } });
    } finally {
      await app.close();
    }
  });
});
