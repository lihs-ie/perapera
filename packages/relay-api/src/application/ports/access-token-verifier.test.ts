import { err, ok } from 'neverthrow';
import { describe, expect, it } from 'vitest';
import { invariantViolationError, type DomainError } from '../../domain/shared/errors';
import { type AccessTokenVerifier } from './access-token-verifier';

describe('AccessTokenVerifier port contract', () => {
  it('can be implemented with ok/err Result', () => {
    const verifier: AccessTokenVerifier = {
      verify: (bearer) =>
        bearer === 'secret'
          ? ok<void, DomainError>(undefined)
          : err<void, DomainError>(
              invariantViolationError({
                invariant: 'access-token-invalid',
                details: 'mismatch',
              }),
            ),
    };
    expect(verifier.verify('secret').isOk()).toBe(true);
    expect(verifier.verify('other').isErr()).toBe(true);
  });
});
