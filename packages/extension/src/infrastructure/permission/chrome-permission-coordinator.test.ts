import { describe, expect, it } from 'vitest';
import {
  createChromePermissionCoordinator,
  type ChromePermissionsApi,
} from './chrome-permission-coordinator';

const createFakeApi = (granted: boolean | Error): ChromePermissionsApi => ({
  request: () => (granted instanceof Error ? Promise.reject(granted) : Promise.resolve(granted)),
});

describe('createChromePermissionCoordinator (IMPL-318, DD-001)', () => {
  it('returns granted when chrome.permissions.request resolves true for tab', async () => {
    const coordinator = createChromePermissionCoordinator({
      chromePermissionsApi: createFakeApi(true),
    });
    const result = await coordinator.requestFor('tab');
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.status).toBe('granted');
      expect(result.value.sourceType).toBe('tab');
    }
  });

  it('returns denied when chrome.permissions.request resolves false for desktop', async () => {
    const coordinator = createChromePermissionCoordinator({
      chromePermissionsApi: createFakeApi(false),
    });
    const result = await coordinator.requestFor('desktop');
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.status).toBe('denied');
      expect(result.value.sourceType).toBe('desktop');
    }
  });

  it('returns system-error DomainError when chrome.permissions.request rejects', async () => {
    const coordinator = createChromePermissionCoordinator({
      chromePermissionsApi: createFakeApi(new Error('permission api down')),
    });
    const result = await coordinator.requestFor('tab');
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.kind).toBe('invariant-violation');
      if (result.error.kind === 'invariant-violation') {
        expect(result.error.invariant).toBe('permission-coordinator-system-error');
      }
    }
  });

  it('returns granted synchronously for microphone (getUserMedia UA prompt handles consent)', async () => {
    const coordinator = createChromePermissionCoordinator({
      chromePermissionsApi: createFakeApi(new Error('should not be called')),
    });
    const result = await coordinator.requestFor('microphone');
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.status).toBe('granted');
      expect(result.value.sourceType).toBe('microphone');
    }
  });
});
