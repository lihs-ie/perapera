import { describe, expect, it, vi } from 'vitest';
import {
  createChromePermissionCoordinator,
  type ChromePermissionsApi,
} from './chrome-permission-coordinator';

type FakeConfig = Readonly<{
  contains?: boolean | Error;
  request?: boolean | Error;
}>;

const resolveOrReject = (value: boolean | Error): Promise<boolean> =>
  value instanceof Error ? Promise.reject(value) : Promise.resolve(value);

const createFakeApi = (config: FakeConfig): ChromePermissionsApi => ({
  contains: vi.fn(() => resolveOrReject(config.contains ?? false)),
  request: vi.fn(() => resolveOrReject(config.request ?? false)),
});

describe('createChromePermissionCoordinator (IMPL-318, DD-001)', () => {
  it('returns granted without calling request when permission is already contained (manifest-declared)', async () => {
    const api = createFakeApi({ contains: true });
    const coordinator = createChromePermissionCoordinator({ chromePermissionsApi: api });
    const result = await coordinator.requestFor('tab');
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.status).toBe('granted');
      expect(result.value.sourceType).toBe('tab');
    }
    expect(api.contains).toHaveBeenCalledTimes(1);
    expect(api.request).not.toHaveBeenCalled();
  });

  it('falls back to request when contains resolves false and request grants', async () => {
    const api = createFakeApi({ contains: false, request: true });
    const coordinator = createChromePermissionCoordinator({ chromePermissionsApi: api });
    const result = await coordinator.requestFor('desktop');
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.status).toBe('granted');
    }
    expect(api.contains).toHaveBeenCalledTimes(1);
    expect(api.request).toHaveBeenCalledTimes(1);
  });

  it('returns denied when contains is false and request resolves false', async () => {
    const api = createFakeApi({ contains: false, request: false });
    const coordinator = createChromePermissionCoordinator({ chromePermissionsApi: api });
    const result = await coordinator.requestFor('desktop');
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.status).toBe('denied');
      expect(result.value.sourceType).toBe('desktop');
    }
  });

  it('returns system-error DomainError when contains rejects', async () => {
    const api = createFakeApi({ contains: new Error('contains api down') });
    const coordinator = createChromePermissionCoordinator({ chromePermissionsApi: api });
    const result = await coordinator.requestFor('tab');
    expect(result.isErr()).toBe(true);
    if (result.isErr() && result.error.kind === 'invariant-violation') {
      expect(result.error.invariant).toBe('permission-coordinator-system-error');
      expect(result.error.details).toContain('contains');
    }
  });

  it('returns system-error DomainError when request rejects after contains is false', async () => {
    const api = createFakeApi({ contains: false, request: new Error('request api down') });
    const coordinator = createChromePermissionCoordinator({ chromePermissionsApi: api });
    const result = await coordinator.requestFor('tab');
    expect(result.isErr()).toBe(true);
    if (result.isErr() && result.error.kind === 'invariant-violation') {
      expect(result.error.invariant).toBe('permission-coordinator-system-error');
      expect(result.error.details).toContain('request');
    }
  });

  it('returns granted synchronously for microphone (getUserMedia UA prompt handles consent)', async () => {
    const api = createFakeApi({ contains: new Error('should not be called') });
    const coordinator = createChromePermissionCoordinator({ chromePermissionsApi: api });
    const result = await coordinator.requestFor('microphone');
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.status).toBe('granted');
      expect(result.value.sourceType).toBe('microphone');
    }
    expect(api.contains).not.toHaveBeenCalled();
    expect(api.request).not.toHaveBeenCalled();
  });
});
