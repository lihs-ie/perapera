import { errAsync, okAsync } from 'neverthrow';
import { describe, expect, it } from 'vitest';
import { invariantViolationError, type DomainError } from '../../domain/shared/errors';
import { type PermissionCoordinator, type PermissionGrant } from './permission-coordinator';

describe('PermissionCoordinator (DD-001)', () => {
  describe('type contract', () => {
    it('accepts an object literal that implements requestFor', () => {
      const mock: PermissionCoordinator = {
        requestFor: () => okAsync({ status: 'granted', sourceType: 'tab' }),
      };
      expect(typeof mock.requestFor).toBe('function');
    });
  });

  describe('requestFor', () => {
    it('returns a granted PermissionGrant when the user allows capture', async () => {
      const mock: PermissionCoordinator = {
        requestFor: (sourceType) => okAsync({ status: 'granted', sourceType }),
      };
      const result = await mock.requestFor('microphone');
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.status).toBe('granted');
        if (result.value.status === 'granted') {
          expect(result.value.sourceType).toBe('microphone');
        }
      }
    });

    it('returns a denied PermissionGrant with an optional reason when the user rejects', async () => {
      const mock: PermissionCoordinator = {
        requestFor: (sourceType) =>
          okAsync({
            status: 'denied',
            sourceType,
            reason: 'user-dismissed-prompt',
          }),
      };
      const result = await mock.requestFor('desktop');
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.status).toBe('denied');
        if (result.value.status === 'denied') {
          expect(result.value.sourceType).toBe('desktop');
          expect(result.value.reason).toBe('user-dismissed-prompt');
        }
      }
    });

    it('returns a DomainError only when the permissions API itself is inoperable', async () => {
      const mock: PermissionCoordinator = {
        requestFor: () =>
          errAsync<PermissionGrant, DomainError>(
            invariantViolationError({
              invariant: 'permission-api-unavailable',
              details: 'chrome.permissions API is not accessible',
            }),
          ),
      };
      const result = await mock.requestFor('tab');
      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.kind).toBe('invariant-violation');
    });
  });
});
