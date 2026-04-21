/**
 * ドメイン層で発生する全エラーを表す discriminated union。
 *
 * 設計方針（IMPL-002 で確定、Phase 0 合意事項）:
 * - `kind` プロパティ (kebab-case) で判別、`switch` 網羅性を活用
 * - factory 関数で生成（class 階層は採用せず）
 * - `neverthrow` の `Result<T, DomainError>` の E に使う
 * - UI 文言はアプリケーション層で個別変換する（本ファイルの describe はログ用）
 */
export type DomainError =
  | SessionStateTransitionError
  | InvariantViolationError
  | ValidationError
  | NotFoundError;

export type SessionStateTransitionError = Readonly<{
  kind: 'session-state-transition';
  from: string;
  to: string;
  reason: string;
}>;

export type InvariantViolationError = Readonly<{
  kind: 'invariant-violation';
  invariant: string;
  details: string;
}>;

export type ValidationError = Readonly<{
  kind: 'validation';
  field: string;
  message: string;
}>;

export type NotFoundError = Readonly<{
  kind: 'not-found';
  resourceType: string;
  identifier: string;
}>;

export const sessionStateTransitionError = (params: {
  from: string;
  to: string;
  reason: string;
}): SessionStateTransitionError => ({
  kind: 'session-state-transition',
  from: params.from,
  to: params.to,
  reason: params.reason,
});

export const invariantViolationError = (params: {
  invariant: string;
  details: string;
}): InvariantViolationError => ({
  kind: 'invariant-violation',
  invariant: params.invariant,
  details: params.details,
});

export const validationError = (params: { field: string; message: string }): ValidationError => ({
  kind: 'validation',
  field: params.field,
  message: params.message,
});

export const notFoundError = (params: {
  resourceType: string;
  identifier: string;
}): NotFoundError => ({
  kind: 'not-found',
  resourceType: params.resourceType,
  identifier: params.identifier,
});

/**
 * DomainError を開発者向けログ・デバッグ用の文字列に変換する。
 * エンドユーザー向け UI 文言には使用せず、アプリケーション層で
 * `use-case.md §9.2 例外変換テーブル` に従い個別変換する。
 */
export const describeDomainError = (error: DomainError): string => {
  switch (error.kind) {
    case 'session-state-transition':
      return `Invalid state transition from ${error.from} to ${error.to}: ${error.reason}`;
    case 'invariant-violation':
      return `Invariant violated: ${error.invariant} (${error.details})`;
    case 'validation':
      return `Validation failed for ${error.field}: ${error.message}`;
    case 'not-found':
      return `${error.resourceType} not found: ${error.identifier}`;
  }
};
