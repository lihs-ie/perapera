import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import {
  invariantViolationError,
  sessionStateTransitionError,
  validationError,
  type DomainError,
} from '../shared/errors';
import { parseSessionIdentifier, type SessionIdentifier } from './session-identifier';
import { parseStreamTokenIdentifier, type StreamTokenIdentifier } from './stream-token-identifier';
import { type RelaySessionState } from './relay-session-state';

/**
 * `POST /sessions` の入力から生成される Relay 側の Session 集約。
 *
 * - 状態機械: created → streaming → ended / error
 *   (error / ended は終端)
 * - stream token は発行時に紐付け、expiresAt で失効
 * - overlayTarget / client 情報はクライアント側で利用するため保持 (ログ・
 *   デバッグ用途)
 */

const sourceTypeSchema = z.enum(['tab', 'microphone', 'desktop']);
const languageTagSchema = z.string().regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/, 'invalid BCP-47 tag');
const iso8601Schema = z.string().datetime();

export type RelaySessionSourceType = z.infer<typeof sourceTypeSchema>;

export type RelaySessionOverlayTarget =
  | Readonly<{ kind: 'tab'; tabId: number }>
  | Readonly<{ kind: 'extension-monitor'; pageId: string }>;

export type RelaySessionClient = Readonly<{
  extensionVersion: string;
  protocolVersion: string;
}>;

export type RelaySession = Readonly<{
  sessionIdentifier: SessionIdentifier;
  streamTokenIdentifier: StreamTokenIdentifier;
  state: RelaySessionState;
  sourceType: RelaySessionSourceType;
  displayName: string;
  sourceLanguage: string | null;
  autoDetectLanguage: boolean;
  targetLanguage: string;
  overlayTarget: RelaySessionOverlayTarget;
  client: RelaySessionClient;
  createdAt: string;
  expiresAt: string;
}>;

export type CreateRelaySessionParams = {
  sessionIdentifier: string;
  streamTokenIdentifier: string;
  sourceType: string;
  displayName: string;
  sourceLanguage: string | null;
  autoDetectLanguage: boolean;
  targetLanguage: string;
  overlayTarget: unknown;
  client: { extensionVersion: string; protocolVersion: string };
  createdAt: string;
  expiresAt: string;
};

const overlayTargetTabSchema = z.object({
  kind: z.literal('tab'),
  tabId: z.number().int().positive(),
});

const overlayTargetMonitorSchema = z.object({
  kind: z.literal('extension-monitor'),
  pageId: z.string().min(1),
});

const overlayTargetSchema = z.union([overlayTargetTabSchema, overlayTargetMonitorSchema]);

const parseOverlayTarget = (value: unknown): Result<RelaySessionOverlayTarget, DomainError> => {
  const result = overlayTargetSchema.safeParse(value);
  if (!result.success) {
    return err(
      validationError({
        field: 'RelaySession.overlayTarget',
        message: 'must be {kind:tab,tabId} or {kind:extension-monitor,pageId}',
      }),
    );
  }
  return ok(result.data);
};

const validateTimestamp = (field: string, value: string): Result<string, DomainError> => {
  const result = iso8601Schema.safeParse(value);
  if (!result.success) {
    return err(
      validationError({
        field,
        message: 'must be ISO 8601 datetime',
      }),
    );
  }
  return ok(result.data);
};

export const createRelaySession = (
  params: CreateRelaySessionParams,
): Result<RelaySession, DomainError> =>
  parseSessionIdentifier(params.sessionIdentifier).andThen((sessionIdentifier) =>
    parseStreamTokenIdentifier(params.streamTokenIdentifier).andThen((streamTokenIdentifier) => {
      const sourceTypeResult = sourceTypeSchema.safeParse(params.sourceType);
      if (!sourceTypeResult.success) {
        return err(
          validationError({
            field: 'RelaySession.sourceType',
            message: 'must be tab / microphone / desktop',
          }),
        );
      }
      if (params.displayName.trim().length === 0) {
        return err(
          validationError({
            field: 'RelaySession.displayName',
            message: 'must be non-empty',
          }),
        );
      }
      if (params.sourceLanguage !== null) {
        const lang = languageTagSchema.safeParse(params.sourceLanguage);
        if (!lang.success) {
          return err(
            validationError({
              field: 'RelaySession.sourceLanguage',
              message: 'must be a BCP-47 tag or null',
            }),
          );
        }
      }
      if (!params.autoDetectLanguage && params.sourceLanguage === null) {
        return err(
          invariantViolationError({
            invariant: 'source-language-required-when-auto-detect-off',
            details: 'sourceLanguage must be set when autoDetectLanguage is false',
          }),
        );
      }
      const targetLangResult = languageTagSchema.safeParse(params.targetLanguage);
      if (!targetLangResult.success) {
        return err(
          validationError({
            field: 'RelaySession.targetLanguage',
            message: 'must be a BCP-47 tag',
          }),
        );
      }
      return parseOverlayTarget(params.overlayTarget).andThen((overlayTarget) =>
        validateTimestamp('RelaySession.createdAt', params.createdAt).andThen((createdAt) =>
          validateTimestamp('RelaySession.expiresAt', params.expiresAt).andThen((expiresAt) => {
            if (new Date(expiresAt).getTime() <= new Date(createdAt).getTime()) {
              return err(
                invariantViolationError({
                  invariant: 'expires-at-must-be-after-created-at',
                  details: `expiresAt=${expiresAt} must be later than createdAt=${createdAt}`,
                }),
              );
            }
            return ok<RelaySession, DomainError>({
              sessionIdentifier,
              streamTokenIdentifier,
              state: 'created',
              sourceType: sourceTypeResult.data,
              displayName: params.displayName,
              sourceLanguage: params.sourceLanguage,
              autoDetectLanguage: params.autoDetectLanguage,
              targetLanguage: targetLangResult.data,
              overlayTarget,
              client: {
                extensionVersion: params.client.extensionVersion,
                protocolVersion: params.client.protocolVersion,
              },
              createdAt,
              expiresAt,
            });
          }),
        ),
      );
    }),
  );

const ALLOWED_TRANSITIONS: Readonly<Record<RelaySessionState, readonly RelaySessionState[]>> = {
  created: ['streaming', 'ended', 'error'],
  streaming: ['ended', 'error'],
  ended: [],
  error: [],
};

const transitionGuard = (
  session: RelaySession,
  target: RelaySessionState,
  reason: string,
): Result<RelaySession, DomainError> => {
  if (!ALLOWED_TRANSITIONS[session.state].includes(target)) {
    return err(
      sessionStateTransitionError({
        from: session.state,
        to: target,
        reason,
      }),
    );
  }
  return ok({ ...session, state: target });
};

export const startStreaming = (session: RelaySession): Result<RelaySession, DomainError> =>
  transitionGuard(session, 'streaming', 'streaming is only allowed from created');

export const endSession = (session: RelaySession): Result<RelaySession, DomainError> =>
  transitionGuard(session, 'ended', 'end is not allowed from terminal states');

export const markSessionError = (session: RelaySession): Result<RelaySession, DomainError> =>
  transitionGuard(session, 'error', 'error is not allowed from terminal states');
