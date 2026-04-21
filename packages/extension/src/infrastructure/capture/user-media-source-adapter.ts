import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import { type SessionIdentifier } from '../../domain/session/session-identifier';
import { invariantViolationError, type DomainError } from '../../domain/shared/errors';
import {
  type SourceAdapter,
  type StartSourceCommand,
} from '../../application/ports/source-adapter';

/**
 * `navigator.mediaDevices.getUserMedia` を最小限の contract に抽象化した
 * adapter。production では default 実装、test では mock を注入する。
 */
export type UserMediaApi = {
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
};

/**
 * Production `UserMediaApi` 実装 (mock ではない)。entrypoint で
 * `createUserMediaSourceAdapter({ userMediaApi: defaultUserMediaApi })` と
 * 明示注入する。
 */
export const defaultUserMediaApi: UserMediaApi = {
  getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
};

export type UserMediaSourceAdapterDependencies = Readonly<{
  userMediaApi: UserMediaApi;
}>;

const buildConstraints = (command: StartSourceCommand): MediaStreamConstraints => {
  if (command.sourceType !== 'microphone') {
    return { audio: true, video: false };
  }
  if (command.deviceId !== undefined) {
    return {
      audio: { deviceId: { exact: command.deviceId } },
      video: false,
    };
  }
  return { audio: true, video: false };
};

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
 * IMPL-301 UserMediaSourceAdapter (DD-102)。
 *
 * 入力ソース `microphone` 用の `SourceAdapter` 実装。
 *
 * **本番実装で mock が利用されない設計**:
 * - `userMediaApi` は必須 DI (default なし)
 * - production entrypoint で `defaultUserMediaApi` を明示的に渡す
 */
export const createUserMediaSourceAdapter = (
  deps: UserMediaSourceAdapterDependencies,
): SourceAdapter => {
  const openStreams = new Map<SessionIdentifier, MediaStream>();

  return {
    open: (command) => {
      if (command.sourceType !== 'microphone') {
        return errAsync<MediaStream, DomainError>(
          invariantViolationError({
            invariant: 'user-media-source-mismatch',
            details: `expected microphone, received ${command.sourceType}`,
          }),
        );
      }
      const constraints = buildConstraints(command);
      return ResultAsync.fromPromise<MediaStream, DomainError>(
        deps.userMediaApi.getUserMedia(constraints),
        (cause) =>
          invariantViolationError({
            invariant: 'user-media-capture-failed',
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
