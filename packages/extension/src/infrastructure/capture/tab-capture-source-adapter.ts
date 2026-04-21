import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import { type SessionIdentifier } from '../../domain/session/session-identifier';
import { invariantViolationError, type DomainError } from '../../domain/shared/errors';
import {
  type SourceAdapter,
  type StartSourceCommand,
} from '../../application/ports/source-adapter';

/**
 * `chrome.tabCapture.capture` を最小 contract で抽象化した adapter。
 * production では callback を Promise に wrap した default 実装、test では
 * mock を注入する。
 */
export type TabCaptureApi = {
  capture: (options: chrome.tabCapture.CaptureOptions) => Promise<MediaStream | null>;
};

/**
 * Production `TabCaptureApi` 実装 (mock ではない)。callback を Promise に
 * wrap し、`chrome.runtime.lastError` を Error に変換する。
 */
export const defaultTabCaptureApi: TabCaptureApi = {
  capture: (options) =>
    new Promise<MediaStream | null>((resolve, reject) => {
      try {
        chrome.tabCapture.capture(options, (stream) => {
          const lastError = chrome.runtime.lastError;
          if (lastError !== undefined) {
            reject(new Error(lastError.message ?? 'unknown tabCapture error'));
            return;
          }
          resolve(stream);
        });
      } catch (cause) {
        reject(cause instanceof Error ? cause : new Error(String(cause)));
      }
    }),
};

export type TabCaptureSourceAdapterDependencies = Readonly<{
  tabCaptureApi: TabCaptureApi;
}>;

const hasStopMethod = (value: unknown): value is { stop: () => void } => {
  if (typeof value !== 'object' || value === null) return false;
  const stop: unknown = Reflect.get(value, 'stop');
  return typeof stop === 'function';
};

const stopAllTracks = (stream: MediaStream): void => {
  for (const track of stream.getTracks()) {
    if (hasStopMethod(track)) {
      track.stop();
    }
  }
};

/**
 * IMPL-300 TabCaptureSourceAdapter (DD-101)。
 *
 * 入力ソース `tab` 用 `SourceAdapter` 実装。`tabCaptureApi` は必須 DI。
 * production では `defaultTabCaptureApi` を明示的に渡す。
 *
 * `chrome.tabCapture.capture` は audio-only で呼ぶ (設計書 §5 / api-spec §6.2
 * の PCM 転送経路に合わせる)。`tabId` 指定は拡張 API として MV3 の
 * `getMediaStreamId` 経由が必要だが、MVP は最小 options のみ。
 */
export const createTabCaptureSourceAdapter = (
  deps: TabCaptureSourceAdapterDependencies,
): SourceAdapter => {
  const openStreams = new Map<SessionIdentifier, MediaStream>();

  return {
    open: (command: StartSourceCommand) => {
      if (command.sourceType !== 'tab') {
        return errAsync<MediaStream, DomainError>(
          invariantViolationError({
            invariant: 'tab-capture-source-mismatch',
            details: `expected tab, received ${command.sourceType}`,
          }),
        );
      }
      const options: chrome.tabCapture.CaptureOptions = {
        audio: true,
        video: false,
      };
      return ResultAsync.fromPromise<MediaStream | null, DomainError>(
        deps.tabCaptureApi.capture(options),
        (cause) =>
          invariantViolationError({
            invariant: 'tab-capture-failed',
            details: cause instanceof Error ? cause.message : 'unknown error',
          }),
      ).andThen((stream): ResultAsync<MediaStream, DomainError> => {
        if (stream === null) {
          return errAsync<MediaStream, DomainError>(
            invariantViolationError({
              invariant: 'tab-capture-null-stream',
              details: 'chrome.tabCapture returned null (tab not audible or permission revoked)',
            }),
          );
        }
        openStreams.set(command.sessionIdentifier, stream);
        return okAsync<MediaStream, DomainError>(stream);
      });
    },

    close: (sessionIdentifier) => {
      const stream = openStreams.get(sessionIdentifier);
      if (stream === undefined) return okAsync(undefined);
      stopAllTracks(stream);
      openStreams.delete(sessionIdentifier);
      return okAsync(undefined);
    },
  };
};
