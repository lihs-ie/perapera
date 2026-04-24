import { describe, expect, it } from 'vitest';
import {
  createSessionRetentionPolicy,
  DEFAULT_SESSION_RETENTION_POLICY,
  RETENTION_DAYS_MAX,
  RETENTION_DAYS_MIN,
  RETENTION_MAX_COUNT_MAX,
  RETENTION_MAX_COUNT_MIN,
} from './session-retention-policy';

describe('SessionRetentionPolicy (DD-239, Issue #124)', () => {
  it('accepts days only policy', () => {
    const result = createSessionRetentionPolicy({ days: 30, maxCount: null });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.days).toBe(30);
      expect(result.value.maxCount).toBeNull();
    }
  });

  it('accepts maxCount only policy', () => {
    const result = createSessionRetentionPolicy({ days: null, maxCount: 100 });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.days).toBeNull();
      expect(result.value.maxCount).toBe(100);
    }
  });

  it('accepts both days and maxCount', () => {
    const result = createSessionRetentionPolicy({ days: 30, maxCount: 100 });
    expect(result.isOk()).toBe(true);
  });

  it('rejects both null (must have at least one bound)', () => {
    const result = createSessionRetentionPolicy({ days: null, maxCount: null });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('validation');
  });

  it('rejects days below min (1)', () => {
    const result = createSessionRetentionPolicy({ days: 0, maxCount: null });
    expect(result.isErr()).toBe(true);
  });

  it('rejects days above max (365)', () => {
    const result = createSessionRetentionPolicy({ days: 366, maxCount: null });
    expect(result.isErr()).toBe(true);
  });

  it('accepts days boundary values', () => {
    expect(createSessionRetentionPolicy({ days: RETENTION_DAYS_MIN, maxCount: null }).isOk()).toBe(
      true,
    );
    expect(createSessionRetentionPolicy({ days: RETENTION_DAYS_MAX, maxCount: null }).isOk()).toBe(
      true,
    );
  });

  it('rejects maxCount below min (1)', () => {
    const result = createSessionRetentionPolicy({ days: null, maxCount: 0 });
    expect(result.isErr()).toBe(true);
  });

  it('rejects maxCount above max (10000)', () => {
    const result = createSessionRetentionPolicy({ days: null, maxCount: 10001 });
    expect(result.isErr()).toBe(true);
  });

  it('accepts maxCount boundary values', () => {
    expect(
      createSessionRetentionPolicy({ days: null, maxCount: RETENTION_MAX_COUNT_MIN }).isOk(),
    ).toBe(true);
    expect(
      createSessionRetentionPolicy({ days: null, maxCount: RETENTION_MAX_COUNT_MAX }).isOk(),
    ).toBe(true);
  });

  it('rejects non-integer days', () => {
    const result = createSessionRetentionPolicy({ days: 30.5, maxCount: null });
    expect(result.isErr()).toBe(true);
  });

  it('rejects non-integer maxCount', () => {
    const result = createSessionRetentionPolicy({ days: null, maxCount: 100.5 });
    expect(result.isErr()).toBe(true);
  });

  it('DEFAULT_SESSION_RETENTION_POLICY is 30 days / 100 count', () => {
    expect(DEFAULT_SESSION_RETENTION_POLICY.days).toBe(30);
    expect(DEFAULT_SESSION_RETENTION_POLICY.maxCount).toBe(100);
  });
});
