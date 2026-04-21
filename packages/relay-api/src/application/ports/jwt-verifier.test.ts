import { errAsync, okAsync } from 'neverthrow';
import { describe, expect, it } from 'vitest';
import { invariantViolationError, type DomainError } from '../../domain/shared/errors';
import { type JwtVerifiedPayload, type JwtVerifier } from './jwt-verifier';

describe('JwtVerifier port contract', () => {
  it('can be implemented with a mock that returns a verified payload', async () => {
    const verifier: JwtVerifier = {
      verify: (token: string) => {
        if (token === 'valid.jwt') {
          return okAsync<JwtVerifiedPayload, DomainError>({
            jti: 'strm_01HZX8Y1R8M7D3Q2P4T5V6W7A1',
            sub: '01HZX8Y1R8M7D3Q2P4T5V6W7A2',
            expiresAtEpochSec: 1_700_000_000,
            issuedAtEpochSec: 1_699_999_400,
            claims: { sourceType: 'tab' },
          });
        }
        return errAsync<JwtVerifiedPayload, DomainError>(
          invariantViolationError({
            invariant: 'jwt-verification-failed',
            details: 'invalid token',
          }),
        );
      },
    };

    const ok = await verifier.verify('valid.jwt');
    expect(ok.isOk()).toBe(true);
    if (ok.isOk()) expect(ok.value.claims['sourceType']).toBe('tab');

    const bad = await verifier.verify('bad.jwt');
    expect(bad.isErr()).toBe(true);
  });
});
