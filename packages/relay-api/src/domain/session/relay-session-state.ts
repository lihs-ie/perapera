import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import { type DomainError, validationError } from '../shared/errors';

/**
 * Relay Session の状態 (IMPL-400)。
 *
 * 拡張側 `SourceSession` よりシンプル:
 * - `created`: `POST /sessions` 成功直後。まだ WebSocket 接続なし
 * - `streaming`: WebSocket 接続が確立し、audio.frame を受信中
 * - `ended`: クライアントが `stop` を送信、または `expiresAt` 到達
 * - `error`: プロバイダエラー (STT/翻訳) / 認証失敗 / レート制限超過
 */
export const RELAY_SESSION_STATES = ['created', 'streaming', 'ended', 'error'] as const;

const schema = z.enum(RELAY_SESSION_STATES);

export type RelaySessionState = z.infer<typeof schema>;

export const parseRelaySessionState = (value: unknown): Result<RelaySessionState, DomainError> => {
  const result = schema.safeParse(value);
  if (!result.success) {
    return err(
      validationError({
        field: 'RelaySessionState',
        message: `expected one of [${RELAY_SESSION_STATES.join(', ')}]`,
      }),
    );
  }
  return ok(result.data);
};
