import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import { type SessionIdentifier } from '../../domain/session/session-identifier';
import { invariantViolationError, type DomainError } from '../../domain/shared/errors';
import {
  type SourceAdapter,
  type StartSourceCommand,
} from '../../application/ports/source-adapter';

/**
 * `navigator.mediaDevices.getDisplayMedia` を抽象化した adapter。
 * production では default 実装、test では mock を注入する。
 *
 * `getDisplayMedia` は browser 側が source (screen / window / tab) 選択の
 * prompt を表示する。MV3 の `chrome.desktopCapture.chooseDesktopMedia` は
 * 拡張 background からの低レベル API だが、本 MVP では getDisplayMedia
 * のみを使用 (content script / offscreen document 側の簡潔性優先)。
 */
export type DesktopCaptureApi = {
  getDisplayMedia: (constraints: DisplayMediaStreamOptions) => Promise<MediaStream>;
};

/**
 * Production `DesktopCaptureApi` 実装 (mock ではない)。
 */
export const defaultDesktopCaptureApi: DesktopCaptureApi = {
  getDisplayMedia: (constraints) => navigator.mediaDevices.getDisplayMedia(constraints),
};

export type DesktopCaptureSourceAdapterDependencies = Readonly<{
  desktopCaptureApi: DesktopCaptureApi;
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
 * IMPL-302 DesktopCaptureSourceAdapter (DD-103)。
 *
 * 入力ソース `desktop` 用 `SourceAdapter` 実装。audio capture を主目的と
 * するが、`getDisplayMedia` は video を伴う場合があるため `video: true` を
 * 指定して成功率を上げる (取得後に audio track のみ使用)。
 */
export const createDesktopCaptureSourceAdapter = (
  deps: DesktopCaptureSourceAdapterDependencies,
): SourceAdapter => {
  const openStreams = new Map<SessionIdentifier, MediaStream>();

  return {
    open: (command: StartSourceCommand) => {
      if (command.sourceType !== 'desktop') {
        return errAsync<MediaStream, DomainError>(
          invariantViolationError({
            invariant: 'desktop-capture-source-mismatch',
            details: `expected desktop, received ${command.sourceType}`,
          }),
        );
      }
      const constraints: DisplayMediaStreamOptions = {
        audio: true,
        video: true,
      };
      return ResultAsync.fromPromise<MediaStream, DomainError>(
        deps.desktopCaptureApi.getDisplayMedia(constraints),
        (cause) =>
          invariantViolationError({
            invariant: 'desktop-capture-failed',
            details: cause instanceof Error ? cause.message : 'unknown error',
          }),
      ).map((stream) => {
        openStreams.set(command.sessionIdentifier, stream);
        return stream;
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
