import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import { type DomainError, validationError } from '../shared/errors';

/**
 * エンドポインティング方針 (DD-236)。
 *
 * STT プロバイダが「文末」と判定する挙動を調整する値オブジェクト。息継ぎなどの
 * 短い無音で発話が分断されるのを抑制するための調整軸 (REQ-NF-018)。
 *
 * - `silenceThresholdMs`: 200〜1200ms、既定 600ms。これを超える無音で final を確定する
 * - `punctuationAware`: 既定 true。句読点を文末判定に利用するか
 * - `minUtteranceMs`: 100〜3000ms、既定 500ms。これ未満の発話は final に昇格しない
 */
const endpointingPolicySchema = z
  .object({
    silenceThresholdMs: z.number().int().min(200).max(1200),
    punctuationAware: z.boolean(),
    minUtteranceMs: z.number().int().min(100).max(3000),
  })
  .brand<'EndpointingPolicy'>();

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
