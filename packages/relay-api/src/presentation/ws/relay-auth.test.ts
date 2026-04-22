import { errAsync, okAsync } from 'neverthrow';
import { describe, expect, it } from 'vitest';
import { type JwtVerifiedPayload, type JwtVerifier } from '../../application/ports/jwt-verifier';
import { invariantViolationError, type DomainError } from '../../domain/shared/errors';
import { authorizeRelayUpgrade } from './relay-auth';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const TOKEN_ID = 'strm_01HZX8Y1R8M7D3Q2P4T5V6W7A2';

const validPayload: JwtVerifiedPayload = {
  jti: TOKEN_ID,
  sub: SESSION_ID,
  expiresAtEpochSec: Math.floor(Date.now() / 1000) + 600,
  issuedAtEpochSec: Math.floor(Date.now() / 1000) - 10,
  claims: { sourceType: 'tab' },
};

const okVerifier: JwtVerifier = {
  verify: () => okAsync<JwtVerifiedPayload, DomainError>(validPayload),
};

const failingVerifier: JwtVerifier = {
  verify: () =>
    errAsync<JwtVerifiedPayload, DomainError>(
      invariantViolationError({ invariant: 'jwt-verification-failed', details: 'boom' }),
    ),
};

describe('authorizeRelayUpgrade', () => {
  it('succeeds when Authorization is valid, sessionId matches sub, and protocolVersion is supported', async () => {
    const result = await authorizeRelayUpgrade(
      {
        authorizationHeader: 'Bearer valid.jwt.string',
        tokenQuery: undefined,
        sessionIdQuery: SESSION_ID,
        protocolVersionQuery: '1.0',
      },
      okVerifier,
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.sessionId).toBe(SESSION_ID);
      expect(result.value.protocolVersion).toBe('1.0');
      expect(result.value.tokenPayload.jti).toBe(TOKEN_ID);
    }
  });

  it('rejects when Authorization header is missing', async () => {
    const result = await authorizeRelayUpgrade(
      {
        authorizationHeader: undefined,
        tokenQuery: undefined,
        sessionIdQuery: SESSION_ID,
        protocolVersionQuery: '1.0',
      },
      okVerifier,
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr() && result.error.kind === 'invariant-violation') {
      expect(result.error.invariant).toBe('relay-missing-authorization');
    }
  });

  it('rejects when Authorization header does not use Bearer scheme', async () => {
    const result = await authorizeRelayUpgrade(
      {
        authorizationHeader: 'Basic abc',
        tokenQuery: undefined,
        sessionIdQuery: SESSION_ID,
        protocolVersionQuery: '1.0',
      },
      okVerifier,
    );
    expect(result.isErr()).toBe(true);
  });

  it('rejects when Bearer token is empty', async () => {
    const result = await authorizeRelayUpgrade(
      {
        authorizationHeader: 'Bearer ',
        tokenQuery: undefined,
        sessionIdQuery: SESSION_ID,
        protocolVersionQuery: '1.0',
      },
      okVerifier,
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr() && result.error.kind === 'invariant-violation') {
      expect(result.error.invariant).toBe('relay-empty-authorization');
    }
  });

  it('surfaces JwtVerifier failure as invariant-violation', async () => {
    const result = await authorizeRelayUpgrade(
      {
        authorizationHeader: 'Bearer expired.jwt',
        tokenQuery: undefined,
        sessionIdQuery: SESSION_ID,
        protocolVersionQuery: '1.0',
      },
      failingVerifier,
    );
    expect(result.isErr()).toBe(true);
  });

  it('rejects when protocolVersion is missing', async () => {
    const result = await authorizeRelayUpgrade(
      {
        authorizationHeader: 'Bearer valid.jwt',
        tokenQuery: undefined,
        sessionIdQuery: SESSION_ID,
        protocolVersionQuery: undefined,
      },
      okVerifier,
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr() && result.error.kind === 'invariant-violation') {
      expect(result.error.invariant).toBe('relay-missing-protocol-version');
    }
  });

  it('rejects when protocolVersion is unsupported', async () => {
    const result = await authorizeRelayUpgrade(
      {
        authorizationHeader: 'Bearer valid.jwt',
        tokenQuery: undefined,
        sessionIdQuery: SESSION_ID,
        protocolVersionQuery: '2.0',
      },
      okVerifier,
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr() && result.error.kind === 'invariant-violation') {
      expect(result.error.invariant).toBe('relay-unsupported-protocol-version');
    }
  });

  it('rejects when sessionId query is missing', async () => {
    const result = await authorizeRelayUpgrade(
      {
        authorizationHeader: 'Bearer valid.jwt',
        tokenQuery: undefined,
        sessionIdQuery: undefined,
        protocolVersionQuery: '1.0',
      },
      okVerifier,
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr() && result.error.kind === 'invariant-violation') {
      expect(result.error.invariant).toBe('relay-missing-session-id');
    }
  });

  it('rejects when sessionId query does not match token sub', async () => {
    const result = await authorizeRelayUpgrade(
      {
        authorizationHeader: 'Bearer valid.jwt',
        tokenQuery: undefined,
        sessionIdQuery: 'different-session-id',
        protocolVersionQuery: '1.0',
      },
      okVerifier,
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr() && result.error.kind === 'invariant-violation') {
      expect(result.error.invariant).toBe('relay-session-id-mismatch');
    }
  });

  it('accepts token from ?token query when Authorization header is missing (browser WS client path)', async () => {
    const result = await authorizeRelayUpgrade(
      {
        authorizationHeader: undefined,
        tokenQuery: 'valid.jwt.from.query',
        sessionIdQuery: SESSION_ID,
        protocolVersionQuery: '1.0',
      },
      okVerifier,
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.sessionId).toBe(SESSION_ID);
    }
  });

  it('prefers Authorization header over tokenQuery when both are present', async () => {
    let capturedToken: string | null = null;
    const captureVerifier: JwtVerifier = {
      verify: (token) => {
        capturedToken = token;
        return okAsync<JwtVerifiedPayload, DomainError>(validPayload);
      },
    };
    await authorizeRelayUpgrade(
      {
        authorizationHeader: 'Bearer from.header',
        tokenQuery: 'from.query',
        sessionIdQuery: SESSION_ID,
        protocolVersionQuery: '1.0',
      },
      captureVerifier,
    );
    expect(capturedToken).toBe('from.header');
  });

  it('rejects when neither Authorization nor tokenQuery is present', async () => {
    const result = await authorizeRelayUpgrade(
      {
        authorizationHeader: undefined,
        tokenQuery: undefined,
        sessionIdQuery: SESSION_ID,
        protocolVersionQuery: '1.0',
      },
      okVerifier,
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr() && result.error.kind === 'invariant-violation') {
      expect(result.error.invariant).toBe('relay-missing-authorization');
    }
  });

  it('rejects when tokenQuery is empty string and header is missing', async () => {
    const result = await authorizeRelayUpgrade(
      {
        authorizationHeader: undefined,
        tokenQuery: '',
        sessionIdQuery: SESSION_ID,
        protocolVersionQuery: '1.0',
      },
      okVerifier,
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr() && result.error.kind === 'invariant-violation') {
      expect(result.error.invariant).toBe('relay-missing-authorization');
    }
  });
});
