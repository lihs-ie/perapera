import { okAsync } from 'neverthrow';
import { describe, expect, it } from 'vitest';
import { type DomainError } from '../../domain/shared/errors';
import { type JwtSigner, type JwtSignerPayload } from './jwt-signer';

describe('JwtSigner port contract', () => {
  it('can be implemented with a mock that returns a JWT string', async () => {
    const signer: JwtSigner = {
      sign: (payload: JwtSignerPayload) =>
        okAsync<string, DomainError>(`JWT.${payload.jti}.${payload.sub}`),
    };
    const result = await signer.sign({
      jti: 'strm_01HZX8Y1R8M7D3Q2P4T5V6W7A1',
      sub: '01HZX8Y1R8M7D3Q2P4T5V6W7A2',
      expiresAtEpochSec: 1_700_000_000,
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toContain('strm_');
    }
  });

  it('passes extraClaims through to the implementation', async () => {
    const received: JwtSignerPayload[] = [];
    const signer: JwtSigner = {
      sign: (payload) => {
        received.push(payload);
        return okAsync<string, DomainError>('jwt');
      },
    };
    await signer.sign({
      jti: 'strm_01HZX8Y1R8M7D3Q2P4T5V6W7A1',
      sub: '01HZX8Y1R8M7D3Q2P4T5V6W7A2',
      expiresAtEpochSec: 1_700_000_000,
      extraClaims: { ext: 'v1' },
    });
    expect(received[0]?.extraClaims?.['ext']).toBe('v1');
  });
});
