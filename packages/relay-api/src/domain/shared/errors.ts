/**
 * Relay API ドメイン層の共通エラー型。
 *
 * 拡張側 (`packages/extension/src/domain/shared/errors.ts`) と同じ
 * discriminated union + factory 関数パターンで、内容は Relay API の文脈に
 * 合わせる。両 workspace で個別定義する方針 (IMPL-004)。
 *
 * **初期 4 種** (必要に応じて拡張):
 * - `session-state-transition`: 許可されない状態遷移
 * - `invariant-violation`: 集約 / Value Object の不変条件違反
 * - `validation`: 外部入力の形式不正 (Zod 検証失敗等)
 * - `not-found`: エンティティが見つからない
 */

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

export type DomainError =
  | SessionStateTransitionError
  | InvariantViolationError
  | ValidationError
  | NotFoundError;

export const sessionStateTransitionError = (
  params: Omit<SessionStateTransitionError, 'kind'>,
): SessionStateTransitionError => ({ kind: 'session-state-transition', ...params });

export const invariantViolationError = (
  params: Omit<InvariantViolationError, 'kind'>,
): InvariantViolationError => ({ kind: 'invariant-violation', ...params });

export const validationError = (params: Omit<ValidationError, 'kind'>): ValidationError => ({
  kind: 'validation',
  ...params,
});

export const notFoundError = (params: Omit<NotFoundError, 'kind'>): NotFoundError => ({
  kind: 'not-found',
  ...params,
});
