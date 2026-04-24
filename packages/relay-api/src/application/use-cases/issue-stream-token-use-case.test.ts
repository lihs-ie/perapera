import { errAsync, okAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import { invariantViolationError, type DomainError } from '../../domain/shared/errors';
import { type IssueStreamTokenInput } from '../dto/issue-stream-token-dto';
import { type JwtSigner } from '../ports/jwt-signer';
import {
  createIssueStreamTokenUseCase,
  type IssueStreamTokenDependencies,
} from './issue-stream-token-use-case';

const CREATED_AT = '2026-04-21T00:00:00.000Z';
const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const TOKEN_ID = 'strm_01HZX8Y1R8M7D3Q2P4T5V6W7A2';
const JWT_STRING = 'eyJhbGciOiJIUzI1NiJ9.xxx.yyy';
const RELAY_URL = 'wss://relay.example.com/api/v1/relay';

const buildInput = (overrides: Partial<IssueStreamTokenInput> = {}): IssueStreamTokenInput => ({
  sourceType: 'tab',
  displayName: 'YouTube Live',
  sourceLanguage: 'en-US',
  autoDetectLanguage: false,
  targetLanguage: 'ja-JP',
  overlayTarget: { kind: 'tab', tabId: 42 },
  client: { extensionVersion: '0.1.0', protocolVersion: '1.0' },
  ...overrides,
});

const buildDeps = (
  overrides: Partial<IssueStreamTokenDependencies> = {},
): IssueStreamTokenDependencies & {
  jwtSigner: { sign: ReturnType<typeof vi.fn<JwtSigner['sign']>> };
} => {
  const jwtSigner = {
    sign: vi.fn<JwtSigner['sign']>(() => okAsync<string, DomainError>(JWT_STRING)),
  };
  const base: IssueStreamTokenDependencies = {
    jwtSigner,
    clock: () => CREATED_AT,
    sessionIdFactory: () => SESSION_ID,
    streamTokenIdFactory: () => TOKEN_ID,
    relayUrl: RELAY_URL,
    tokenTtlSec: 1800,
    heartbeatIntervalSec: 15,
    maxConcurrentSessions: 3,
    maxFrameRatePerSecond: 10,
  };
  return { ...base, ...overrides, jwtSigner };
};

describe('createIssueStreamTokenUseCase (IMPL-401, stateless)', () => {
  it('returns sessionId + JWT + expiresAt without any repository', async () => {
    const deps = buildDeps();
    const useCase = createIssueStreamTokenUseCase(deps);
    const result = await useCase(buildInput());
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.sessionId).toBe(SESSION_ID);
      expect(result.value.streamToken).toBe(JWT_STRING);
      expect(result.value.relayUrl).toBe(RELAY_URL);
      expect(result.value.expiresAt).toBe('2026-04-21T00:30:00.000Z');
      expect(result.value.heartbeatIntervalSec).toBe(15);
      expect(result.value.audio.sampleRateHz).toBe(16000);
      expect(result.value.limits.maxConcurrentSessions).toBe(3);
    }
    expect(deps.jwtSigner.sign).toHaveBeenCalledTimes(1);
  });

  it('signs the JWT with jti, sub, and expiresAtEpochSec', async () => {
    const deps = buildDeps();
    const useCase = createIssueStreamTokenUseCase(deps);
    await useCase(buildInput());
    const payload = deps.jwtSigner.sign.mock.calls[0]?.[0];
    expect(payload?.jti).toBe(TOKEN_ID);
    expect(payload?.sub).toBe(SESSION_ID);
    expect(payload?.expiresAtEpochSec).toBe(
      Math.floor(new Date('2026-04-21T00:30:00.000Z').getTime() / 1000),
    );
  });

  it('embeds full session metadata into JWT extraClaims (stateless design)', async () => {
    const deps = buildDeps();
    const useCase = createIssueStreamTokenUseCase(deps);
    await useCase(buildInput());
    const payload = deps.jwtSigner.sign.mock.calls[0]?.[0];
    expect(payload?.extraClaims).toEqual({
      sourceType: 'tab',
      displayName: 'YouTube Live',
      sourceLanguage: 'en-US',
      autoDetectLanguage: false,
      targetLanguage: 'ja-JP',
      overlayTarget: { kind: 'tab', tabId: 42 },
      client: { extensionVersion: '0.1.0', protocolVersion: '1.0' },
      createdAt: CREATED_AT,
      endpointing: {
        silenceThresholdMs: 600,
        punctuationAware: true,
        minUtteranceMs: 500,
      },
      translationContext: {
        maxSegments: 3,
        includeTranslatedText: true,
        holdWindowMs: 0,
      },
    });
  });

  it('rejects invalid input (missing displayName)', async () => {
    const deps = buildDeps();
    const useCase = createIssueStreamTokenUseCase(deps);
    const result = await useCase({
      ...buildInput(),
      displayName: '',
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('validation');
    expect(deps.jwtSigner.sign).not.toHaveBeenCalled();
  });

  it('rejects autoDetectLanguage=false with sourceLanguage=null', async () => {
    const deps = buildDeps();
    const useCase = createIssueStreamTokenUseCase(deps);
    const result = await useCase(buildInput({ autoDetectLanguage: false, sourceLanguage: null }));
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('invariant-violation');
    expect(deps.jwtSigner.sign).not.toHaveBeenCalled();
  });

  it('surfaces jwtSigner failure', async () => {
    const deps = buildDeps();
    deps.jwtSigner.sign.mockReturnValueOnce(
      errAsync<string, DomainError>(
        invariantViolationError({ invariant: 'jwt-signing-failed', details: 'boom' }),
      ),
    );
    const useCase = createIssueStreamTokenUseCase(deps);
    const result = await useCase(buildInput());
    expect(result.isErr()).toBe(true);
  });

  it('throws synchronously if tokenTtlSec is non-positive', () => {
    const deps = buildDeps({ tokenTtlSec: 0 });
    expect(() => createIssueStreamTokenUseCase(deps)).toThrow(/tokenTtlSec must be positive/);
  });
});
