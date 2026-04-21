import { describe, expect, it } from 'vitest';
import { createStaticAccessTokenVerifier } from './static-access-token-verifier';

const TOKEN_A = 'access-token-aaaaaaaaaaaaaaaaaaa';
const TOKEN_B = 'access-token-bbbbbbbbbbbbbbbbbbb';

describe('createStaticAccessTokenVerifier', () => {
  it('throws synchronously when allowedTokens is empty', () => {
    expect(() => createStaticAccessTokenVerifier({ allowedTokens: [] })).toThrow(
      /must not be empty/,
    );
  });

  it('throws synchronously when a token is shorter than 16 characters', () => {
    expect(() => createStaticAccessTokenVerifier({ allowedTokens: ['short-token'] })).toThrow(
      /at least 16 characters/,
    );
  });

  it('accepts a matching token', () => {
    const verifier = createStaticAccessTokenVerifier({ allowedTokens: [TOKEN_A] });
    expect(verifier.verify(TOKEN_A).isOk()).toBe(true);
  });

  it('rejects a non-matching token', () => {
    const verifier = createStaticAccessTokenVerifier({ allowedTokens: [TOKEN_A] });
    const result = verifier.verify('definitely-wrong-token-xxxxxxxx');
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('invariant-violation');
  });

  it('accepts any of multiple allowed tokens (rotation support)', () => {
    const verifier = createStaticAccessTokenVerifier({
      allowedTokens: [TOKEN_A, TOKEN_B],
    });
    expect(verifier.verify(TOKEN_A).isOk()).toBe(true);
    expect(verifier.verify(TOKEN_B).isOk()).toBe(true);
  });

  it('rejects empty string even if it would be a zero-length match', () => {
    const verifier = createStaticAccessTokenVerifier({ allowedTokens: [TOKEN_A] });
    const result = verifier.verify('');
    expect(result.isErr()).toBe(true);
  });

  it('rejects tokens that differ only in length (prefix match attempt)', () => {
    const verifier = createStaticAccessTokenVerifier({ allowedTokens: [TOKEN_A] });
    const shorter = TOKEN_A.slice(0, -1);
    const longer = TOKEN_A + 'x';
    expect(verifier.verify(shorter).isErr()).toBe(true);
    expect(verifier.verify(longer).isErr()).toBe(true);
  });
});
