import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import { type DomainError, validationError } from '../shared/errors';

/**
 * 保持期間 (日) の範囲 (DD-239)。
 */
export const RETENTION_DAYS_MIN = 1 as const;
export const RETENTION_DAYS_MAX = 365 as const;

/**
 * 保持件数の範囲 (DD-239)。
 */
export const RETENTION_MAX_COUNT_MIN = 1 as const;
export const RETENTION_MAX_COUNT_MAX = 10000 as const;

const sessionRetentionPolicySchema = z
  .object({
    days: z.number().int().min(RETENTION_DAYS_MIN).max(RETENTION_DAYS_MAX).nullable(),
    maxCount: z.number().int().min(RETENTION_MAX_COUNT_MIN).max(RETENTION_MAX_COUNT_MAX).nullable(),
  })
  .refine((policy) => policy.days !== null || policy.maxCount !== null, {
    message: 'at least one of days or maxCount must be set',
  })
  .brand<'SessionRetentionPolicy'>();

/**
 * セッション履歴保持ポリシー (DD-239, Issue #124)。
 *
 * `days` と `maxCount` の少なくとも一方を必ず設定する。両方 null で
 * 「無期限保持」になる事態を避けるための不変条件 (プライバシー / quota
 * 保護目的で必須)。既定は 30 日 / 100 件の両方併用。
 *
 * 適用順序:
 * - `purgeOlderThan(now - days)` で日数超過を削除
 * - `purgeBeyondCount(maxCount)` で件数超過を削除
 * - 両方ある場合は AND 条件 (古い順から両方の上限を満たす数まで削除)
 */
export type SessionRetentionPolicy = z.infer<typeof sessionRetentionPolicySchema>;

export const DEFAULT_SESSION_RETENTION_POLICY: SessionRetentionPolicy =
  sessionRetentionPolicySchema.parse({
    days: 30,
    maxCount: 100,
  });

export const createSessionRetentionPolicy = (
  params: unknown,
): Result<SessionRetentionPolicy, DomainError> => {
  const result = sessionRetentionPolicySchema.safeParse(params);
  if (!result.success) {
    return err(
      validationError({
        field: 'SessionRetentionPolicy',
        message: result.error.issues.map((issue) => issue.message).join('; '),
      }),
    );
  }
  return ok(result.data);
};
