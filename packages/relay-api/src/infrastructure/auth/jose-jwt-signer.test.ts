import { jwtVerify } from 'jose';
import { describe, expect, it } from 'vitest';
import { createJoseJwtSigner } from './jose-jwt-signer';

const SECRET_32 = new TextEncoder().encode('test-secret-32-bytes-padding!!123456');
const ISSUER = 'https://relay.example.com';
const AUDIENCE = 'perapera-extension';

describe('createJoseJwtSigner', () => {
  it('throws synchronously when the secretKey is shorter than 32 bytes', () => {
    const shortKey = new TextEncoder().encode('too-short');
    expect(() =>
      createJoseJwtSigner({ secretKey: shortKey, issuer: ISSUER, audience: AUDIENCE }),
    ).toThrow(/at least 32 bytes/);
  });

  it('returns a signed JWT whose payload contains jti / sub / iss / aud / exp', async () => {
    const signer = createJoseJwtSigner({
      secretKey: SECRET_32,
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    const exp = Math.floor(Date.now() / 1000) + 600;
    const result = await signer.sign({
      jti: 'strm_01HZX8Y1R8M7D3Q2P4T5V6W7A1',
      sub: '01HZX8Y1R8M7D3Q2P4T5V6W7A2',
      expiresAtEpochSec: exp,
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const { payload } = await jwtVerify(result.value, SECRET_32, {
        issuer: ISSUER,
        audience: AUDIENCE,
      });
      expect(payload.jti).toBe('strm_01HZX8Y1R8M7D3Q2P4T5V6W7A1');
      expect(payload.sub).toBe('01HZX8Y1R8M7D3Q2P4T5V6W7A2');
      expect(payload.exp).toBe(exp);
      expect(payload.iss).toBe(ISSUER);
      expect(payload.aud).toBe(AUDIENCE);
    }
  });

  it('includes extraClaims in the signed payload', async () => {
    const signer = createJoseJwtSigner({
      secretKey: SECRET_32,
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    const exp = Math.floor(Date.now() / 1000) + 600;
    const result = await signer.sign({
      jti: 'strm_01HZX8Y1R8M7D3Q2P4T5V6W7A1',
      sub: '01HZX8Y1R8M7D3Q2P4T5V6W7A2',
      expiresAtEpochSec: exp,
      extraClaims: { pv: '1.0' },
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const { payload } = await jwtVerify(result.value, SECRET_32, {
        issuer: ISSUER,
        audience: AUDIENCE,
      });
      expect(payload['pv']).toBe('1.0');
    }
  });

  it('rejects verification when using a different secretKey', async () => {
    const signer = createJoseJwtSigner({
      secretKey: SECRET_32,
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    const result = await signer.sign({
      jti: 'strm_01HZX8Y1R8M7D3Q2P4T5V6W7A1',
      sub: '01HZX8Y1R8M7D3Q2P4T5V6W7A2',
      expiresAtEpochSec: Math.floor(Date.now() / 1000) + 600,
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const wrongKey = new TextEncoder().encode('wrong-secret-32-bytes-padding!123456');
      await expect(
        jwtVerify(result.value, wrongKey, { issuer: ISSUER, audience: AUDIENCE }),
      ).rejects.toThrow();
    }
  });
});
