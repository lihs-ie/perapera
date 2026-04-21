import { type DomainError } from '../../domain/shared/errors';

/**
 * アプリケーション層エラー (DD-230 / use-case.md §9.2)。
 *
 * ドメイン層の `DomainError` を UI 層が扱いやすい形に変換した
 * discriminated union。`code` は UI のエラーメッセージ辞書やログ分析で
 * 参照される固定文字列 (use-case.md §9.2 テーブル)。
 *
 * 責務分担:
 * - DomainError: ドメイン不変条件違反を表す内部表現
 * - ApplicationError: UI に返す「状態遷移情報のみ」(内部実装詳細を隠蔽)
 *
 * use-case.md §9.2 のマッピング:
 * - `PermissionDeniedError` → `permission-required` (DomainError 側は
 *   `PermissionGrant.denied` で Ok として扱い、UseCase 層で直接構築)
 * - `SessionNotFoundError` → `session-not-found`
 * - `UnsupportedLanguagePairError` → `validation` (code override 可)
 * - `InvalidStateTransitionError` → `conflict`
 * - 予期しない例外 → `internal`
 */
export type ApplicationError =
  | Readonly<{
      type: 'permission-required';
      code: 'CAPTURE-PERMISSION-DENIED';
      sourceType: string;
      message: string;
    }>
  | Readonly<{
      type: 'session-not-found';
      code: 'SESSION_NOT_FOUND';
      identifier: string;
      message: string;
    }>
  | Readonly<{
      type: 'validation';
      code: 'VALIDATION_FAILED' | 'UNSUPPORTED_LANGUAGE_PAIR';
      field: string | null;
      message: string;
    }>
  | Readonly<{
      type: 'conflict';
      code: 'INVALID_STATE_TRANSITION';
      details: string;
      message: string;
    }>
  | Readonly<{
      type: 'internal';
      code: 'INTERNAL_ERROR';
      message: string;
    }>;

export type PermissionRequiredAppError = Extract<ApplicationError, { type: 'permission-required' }>;
export type SessionNotFoundAppError = Extract<ApplicationError, { type: 'session-not-found' }>;
export type ValidationAppError = Extract<ApplicationError, { type: 'validation' }>;
export type ConflictAppError = Extract<ApplicationError, { type: 'conflict' }>;
export type InternalAppError = Extract<ApplicationError, { type: 'internal' }>;

export const permissionRequiredAppError = (params: {
  sourceType: string;
  message: string;
}): PermissionRequiredAppError => ({
  type: 'permission-required',
  code: 'CAPTURE-PERMISSION-DENIED',
  sourceType: params.sourceType,
  message: params.message,
});

export const sessionNotFoundAppError = (params: {
  identifier: string;
  message: string;
}): SessionNotFoundAppError => ({
  type: 'session-not-found',
  code: 'SESSION_NOT_FOUND',
  identifier: params.identifier,
  message: params.message,
});

export const validationAppError = (params: {
  field?: string;
  message: string;
  code?: 'VALIDATION_FAILED' | 'UNSUPPORTED_LANGUAGE_PAIR';
}): ValidationAppError => ({
  type: 'validation',
  code: params.code ?? 'VALIDATION_FAILED',
  field: params.field ?? null,
  message: params.message,
});

export const conflictAppError = (params: {
  details: string;
  message: string;
}): ConflictAppError => ({
  type: 'conflict',
  code: 'INVALID_STATE_TRANSITION',
  details: params.details,
  message: params.message,
});

export const internalAppError = (params: { message: string }): InternalAppError => ({
  type: 'internal',
  code: 'INTERNAL_ERROR',
  message: params.message,
});

/**
 * DomainError → ApplicationError マッパー (use-case.md §9.2 準拠)。
 *
 * ドメイン層から UseCase 層へ propagate してきた Err を UI 層向けに変換する。
 * 内部実装詳細 (invariant 名、remove 詳細等) は message / details に集約して
 * 流し、discriminator + code による分岐のみを UI に露出する。
 */
export const toApplicationError = (error: DomainError): ApplicationError => {
  switch (error.kind) {
    case 'not-found':
      return sessionNotFoundAppError({
        identifier: error.identifier,
        message: `${error.resourceType} not found: ${error.identifier}`,
      });
    case 'validation':
      return validationAppError({
        field: error.field,
        message: error.message,
      });
    case 'session-state-transition':
      return conflictAppError({
        details: `${error.from} -> ${error.to}: ${error.reason}`,
        message: `invalid state transition from ${error.from} to ${error.to}`,
      });
    case 'invariant-violation':
      return conflictAppError({
        details: `${error.invariant}: ${error.details}`,
        message: `domain invariant violated: ${error.invariant}`,
      });
  }
};
