import { describe, expect, it } from 'vitest';
import {
  createEndpointingPolicy,
  DEFAULT_ENDPOINTING_POLICY,
  type EndpointingPolicy,
} from './endpointing-policy';

describe('EndpointingPolicy (DD-236)', () => {
  describe('createEndpointingPolicy', () => {
    it('accepts values within allowed ranges', () => {
      const result = createEndpointingPolicy({
        silenceThresholdMs: 800,
        punctuationAware: true,
        minUtteranceMs: 500,
      });
      expect(result.isOk()).toBe(true);
    });

    it.each([
      ['silenceThresholdMs below lower bound', 199, true, 500],
      ['silenceThresholdMs above upper bound', 1201, true, 500],
      ['minUtteranceMs below lower bound', 600, true, 99],
      ['minUtteranceMs above upper bound', 600, true, 3001],
    ])('rejects %s', (_label, silence, punctuation, minUtterance) => {
      const result = createEndpointingPolicy({
        silenceThresholdMs: silence,
        punctuationAware: punctuation,
        minUtteranceMs: minUtterance,
      });
      expect(result.isErr()).toBe(true);
      result._unsafeUnwrapErr();
    });

    it('rejects non-integer silenceThresholdMs', () => {
      const result = createEndpointingPolicy({
        silenceThresholdMs: 600.5,
        punctuationAware: true,
        minUtteranceMs: 500,
      });
      expect(result.isErr()).toBe(true);
    });

    it('rejects missing fields', () => {
      const result = createEndpointingPolicy({ silenceThresholdMs: 600 });
      expect(result.isErr()).toBe(true);
    });

    it('returns validation error with DomainError shape', () => {
      const result = createEndpointingPolicy({ silenceThresholdMs: 0 });
      expect(result.isErr()).toBe(true);
      const error = result._unsafeUnwrapErr();
      expect(error.kind).toBe('validation');
      if (error.kind === 'validation') {
        expect(error.field).toBe('EndpointingPolicy');
      }
    });
  });

  describe('DEFAULT_ENDPOINTING_POLICY', () => {
    it('exposes the REQ-NF-018 recommended defaults', () => {
      const defaults: EndpointingPolicy = DEFAULT_ENDPOINTING_POLICY;
      expect(defaults.silenceThresholdMs).toBe(600);
      expect(defaults.punctuationAware).toBe(true);
      expect(defaults.minUtteranceMs).toBe(500);
    });
  });
});
