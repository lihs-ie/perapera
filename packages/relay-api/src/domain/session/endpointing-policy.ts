import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import { type DomainError, validationError } from '../shared/errors';

/**
 * エンドポインティング方針 (DD-236, API-002 payload)。
 *
 * STT プロバイダが「文末」と判定する挙動を調整する Relay 側の値オブジェクト。
 * 拡張側 (`packages/extension/src/domain/session/endpointing-policy.ts`) と
 * スキーマを同期しているが、IMPL-004 の方針に従い個別 Zod schema を保持する。
 */
const endpointingPolicySchema = z
  .object({
    silenceThresholdMs: z.number().int().min(200).max(1200),
    punctuationAware: z.boolean(),
    minUtteranceMs: z.number().int().min(100).max(3000),
  })
  .brand<'RelayEndpointingPolicy'>();

export type EndpointingPolicy = z.infer<typeof endpointingPolicySchema>;

export const DEFAULT_ENDPOINTING_POLICY: EndpointingPolicy = endpointingPolicySchema.parse({
  silenceThresholdMs: 600,
  punctuationAware: true,
  minUtteranceMs: 500,
});

export const createEndpointingPolicy = (
  params: unknown,
): Result<EndpointingPolicy, DomainError> => {
  const result = endpointingPolicySchema.safeParse(params);
  if (!result.success) {
    return err(
      validationError({
        field: 'EndpointingPolicy',
        message: result.error.issues.map((issue) => issue.message).join('; '),
      }),
    );
  }
  return ok(result.data);
};

/**
 * POST /sessions リクエストのような partial payload から `EndpointingPolicy`
 * を合成する。未指定のフィールドは既定値で埋める。
 */
export const mergeEndpointingPolicy = (
  defaults: EndpointingPolicy,
  override?: {
    silenceThresholdMs?: number | undefined;
    punctuationAware?: boolean | undefined;
    minUtteranceMs?: number | undefined;
  },
): Result<EndpointingPolicy, DomainError> =>
  createEndpointingPolicy({
    silenceThresholdMs: override?.silenceThresholdMs ?? defaults.silenceThresholdMs,
    punctuationAware: override?.punctuationAware ?? defaults.punctuationAware,
    minUtteranceMs: override?.minUtteranceMs ?? defaults.minUtteranceMs,
  });
