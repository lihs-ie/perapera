import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { createJoseJwtSigner } from './jose-jwt-signer';
import { createJoseJwtVerifier } from './jose-jwt-verifier';

const SECRET_32 = new TextEncoder().encode('test-secret-32-bytes-padding!!123456');
const ISSUER = 'https://relay.example.com';
const AUDIENCE = 'perapera-extension';

const futureEpochSec = () => Math.floor(Date.now() / 1000) + 600;

describe('createJoseJwtVerifier', () => {
  it('throws synchronously when the secretKey is shorter than 32 bytes', () => {
    const shortKey = new TextEncoder().encode('too-short');
    expect(() =>
      createJoseJwtVerifier({ secretKey: shortKey, issuer: ISSUER, audience: AUDIENCE }),
    ).toThrow(/at least 32 bytes/);
  });

  it('verifies a token signed by createJoseJwtSigner and returns jti / sub / exp / iat / claims', async () => {
    const signer = createJoseJwtSigner({
      secretKey: SECRET_32,
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    const verifier = createJoseJwtVerifier({
      secretKey: SECRET_32,
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    const exp = futureEpochSec();
    const signed = await signer.sign({
      jti: 'strm_01HZX8Y1R8M7D3Q2P4T5V6W7A1',
      sub: '01HZX8Y1R8M7D3Q2P4T5V6W7A2',
      expiresAtEpochSec: exp,
      extraClaims: {
        sourceType: 'tab',
        displayName: 'YouTube Live',
        overlayTarget: { kind: 'tab', tabId: 42 },
      },
    });
    expect(signed.isOk()).toBe(true);
    if (!signed.isOk()) return;

    const verified = await verifier.verify(signed.value);
    expect(verified.isOk()).toBe(true);
    if (verified.isOk()) {
      expect(verified.value.jti).toBe('strm_01HZX8Y1R8M7D3Q2P4T5V6W7A1');
      expect(verified.value.sub).toBe('01HZX8Y1R8M7D3Q2P4T5V6W7A2');
      expect(verified.value.expiresAtEpochSec).toBe(exp);
      expect(verified.value.claims['sourceType']).toBe('tab');
      expect(verified.value.claims['displayName']).toBe('YouTube Live');
      expect(verified.value.claims['overlayTarget']).toEqual({ kind: 'tab', tabId: 42 });
    }
  });

  it('excludes standard claims (iss / aud / jti / sub / exp / iat) from the custom claims bag', async () => {
    const signer = createJoseJwtSigner({
      secretKey: SECRET_32,
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    const verifier = createJoseJwtVerifier({
      secretKey: SECRET_32,
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    const signed = (
      await signer.sign({
        jti: 'strm_01HZX8Y1R8M7D3Q2P4T5V6W7A1',
        sub: '01HZX8Y1R8M7D3Q2P4T5V6W7A2',
        expiresAtEpochSec: futureEpochSec(),
        extraClaims: { foo: 'bar' },
      })
    )._unsafeUnwrap();

    const verified = await verifier.verify(signed);
    if (verified.isOk()) {
      expect(verified.value.claims).toEqual({ foo: 'bar' });
      expect(verified.value.claims['iss']).toBeUndefined();
      expect(verified.value.claims['aud']).toBeUndefined();
      expect(verified.value.claims['jti']).toBeUndefined();
    }
  });

  it('rejects tokens signed with a different secretKey', async () => {
    const verifier = createJoseJwtVerifier({
      secretKey: SECRET_32,
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    const wrongKey = new TextEncoder().encode('different-secret-32-bytes-pad!!123456');
    const signedWithWrong = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setJti('strm_01HZX8Y1R8M7D3Q2P4T5V6W7A1')
      .setSubject('01HZX8Y1R8M7D3Q2P4T5V6W7A2')
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(futureEpochSec())
      .sign(wrongKey);
    const result = await verifier.verify(signedWithWrong);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('invariant-violation');
  });

  it('rejects tokens with mismatched issuer', async () => {
    const signer = createJoseJwtSigner({
      secretKey: SECRET_32,
      issuer: 'https://other.example.com',
      audience: AUDIENCE,
    });
    const verifier = createJoseJwtVerifier({
      secretKey: SECRET_32,
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    const signed = (
      await signer.sign({
        jti: 'strm_01HZX8Y1R8M7D3Q2P4T5V6W7A1',
        sub: '01HZX8Y1R8M7D3Q2P4T5V6W7A2',
        expiresAtEpochSec: futureEpochSec(),
      })
    )._unsafeUnwrap();
    const result = await verifier.verify(signed);
    expect(result.isErr()).toBe(true);
  });

  it('rejects tokens with mismatched audience', async () => {
    const signer = createJoseJwtSigner({
      secretKey: SECRET_32,
      issuer: ISSUER,
      audience: 'other-audience',
    });
    const verifier = createJoseJwtVerifier({
      secretKey: SECRET_32,
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    const signed = (
      await signer.sign({
        jti: 'strm_01HZX8Y1R8M7D3Q2P4T5V6W7A1',
        sub: '01HZX8Y1R8M7D3Q2P4T5V6W7A2',
        expiresAtEpochSec: futureEpochSec(),
      })
    )._unsafeUnwrap();
    const result = await verifier.verify(signed);
    expect(result.isErr()).toBe(true);
  });

  it('rejects expired tokens', async () => {
    const verifier = createJoseJwtVerifier({
      secretKey: SECRET_32,
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    const pastEpochSec = Math.floor(Date.now() / 1000) - 3600;
    const expired = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setJti('strm_01HZX8Y1R8M7D3Q2P4T5V6W7A1')
      .setSubject('01HZX8Y1R8M7D3Q2P4T5V6W7A2')
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt(pastEpochSec - 600)
      .setExpirationTime(pastEpochSec)
      .sign(SECRET_32);
    const result = await verifier.verify(expired);
    expect(result.isErr()).toBe(true);
  });

  it('rejects malformed tokens', async () => {
    const verifier = createJoseJwtVerifier({
      secretKey: SECRET_32,
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    const result = await verifier.verify('not-a-jwt');
    expect(result.isErr()).toBe(true);
  });

  it('rejects tokens missing jti (standard claim type violation)', async () => {
    const verifier = createJoseJwtVerifier({
      secretKey: SECRET_32,
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    const signedWithoutJti = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject('01HZX8Y1R8M7D3Q2P4T5V6W7A2')
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(futureEpochSec())
      .sign(SECRET_32);
    const result = await verifier.verify(signedWithoutJti);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.kind).toBe('invariant-violation');
      if (result.error.kind === 'invariant-violation') {
        expect(result.error.invariant).toBe('jwt-missing-jti');
      }
    }
  });
});
