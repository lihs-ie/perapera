import { describe, expect, it } from 'vitest';
import { toHttpErrorEnvelope } from './error-mapper';

describe('toHttpErrorEnvelope', () => {
  it('maps validation errors to 400 VALIDATION_ERROR', () => {
    const envelope = toHttpErrorEnvelope({
      kind: 'validation',
      field: 'displayName',
      message: 'must be non-empty',
    });
    expect(envelope.status).toBe(400);
    expect(envelope.body.error.code).toBe('VALIDATION_ERROR');
    expect(envelope.body.error.message).toContain('displayName');
  });

  it('maps invariant-violation errors to 400 INVARIANT_VIOLATION', () => {
    const envelope = toHttpErrorEnvelope({
      kind: 'invariant-violation',
      invariant: 'source-language-required',
      details: 'must be set',
    });
    expect(envelope.status).toBe(400);
    expect(envelope.body.error.code).toBe('INVARIANT_VIOLATION');
  });

  it('maps session-state-transition errors to 409 INVALID_STATE_TRANSITION', () => {
    const envelope = toHttpErrorEnvelope({
      kind: 'session-state-transition',
      from: 'created',
      to: 'ended',
      reason: 'not allowed',
    });
    expect(envelope.status).toBe(409);
    expect(envelope.body.error.code).toBe('INVALID_STATE_TRANSITION');
  });

  it('maps not-found errors to 404 NOT_FOUND', () => {
    const envelope = toHttpErrorEnvelope({
      kind: 'not-found',
      resourceType: 'RelaySession',
      identifier: 'sess_xxx',
    });
    expect(envelope.status).toBe(404);
    expect(envelope.body.error.code).toBe('NOT_FOUND');
  });
});
