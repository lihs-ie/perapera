import { type DomainError } from '../../domain/shared/errors';

/**
 * Relay API の HTTP エラーレスポンスボディ。
 *
 * api-specification §3.2 に合わせ `error.code` + `error.message` を含める。
 */
export type HttpErrorBody = Readonly<{
  error: Readonly<{
    code: string;
    message: string;
  }>;
}>;

export type HttpErrorEnvelope = Readonly<{
  status: number;
  body: HttpErrorBody;
}>;

/**
 * DomainError → HTTP ステータス / エラーコード マッパー。
 *
 * - validation → 400 VALIDATION_ERROR
 * - invariant-violation → 400 INVARIANT_VIOLATION
 * - session-state-transition → 409 INVALID_STATE_TRANSITION
 * - not-found → 404 NOT_FOUND
 *
 * api-specification §4.2 の "エラーレスポンス" 表に準拠。
 */
export const toHttpErrorEnvelope = (error: DomainError): HttpErrorEnvelope => {
  switch (error.kind) {
    case 'validation':
      return {
        status: 400,
        body: {
          error: {
            code: 'VALIDATION_ERROR',
            message: `${error.field}: ${error.message}`,
          },
        },
      };
    case 'invariant-violation':
      return {
        status: 400,
        body: {
          error: {
            code: 'INVARIANT_VIOLATION',
            message: `${error.invariant}: ${error.details}`,
          },
        },
      };
    case 'session-state-transition':
      return {
        status: 409,
        body: {
          error: {
            code: 'INVALID_STATE_TRANSITION',
            message: `${error.from} → ${error.to}: ${error.reason}`,
          },
        },
      };
    case 'not-found':
      return {
        status: 404,
        body: {
          error: {
            code: 'NOT_FOUND',
            message: `${error.resourceType}: ${error.identifier}`,
          },
        },
      };
  }
};
