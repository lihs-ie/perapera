import { okAsync, type ResultAsync } from 'neverthrow';
import { type SessionIdentifier } from '../../domain/session/session-identifier';
import { type SourceType } from '../../domain/session/source-type';
import { type DomainError } from '../../domain/shared/errors';
import { type AudioFrameChannel, type AudioPreprocessor } from '../ports/audio-preprocessor';
import { type SourceAdapterFactory, type StartSourceCommand } from '../ports/source-adapter';

/**
 * Active な音声キャプチャ 1 本の実体。
 * - `stream`: Source Adapter で開いた `MediaStream`
 * - `frameChannel`: AudioPreprocessor で attach した PCM フレーム配信 channel
 * - `sourceType`: disconnect 時に SourceAdapter を再取得するため保持
 */
export type ActiveCapture = Readonly<{
  sessionIdentifier: SessionIdentifier;
  sourceType: SourceType;
  stream: MediaStream;
  frameChannel: AudioFrameChannel;
}>;

export type CaptureOrchestratorDependencies = Readonly<{
  sourceAdapterFactory: SourceAdapterFactory;
  audioPreprocessor: AudioPreprocessor;
}>;

/**
 * IMPL-341 CaptureOrchestrator (detailed-design §2.2)。
 *
 * `SourceAdapter` と `AudioPreprocessor` を束ねる application service。
 * `connect(command)` でソース接続 → 音声前処理 attach を一括で行い、
 * `ActiveCapture` を返す。`disconnect(sessionIdentifier)` で逆順に解放する。
 *
 * **本番実装で mock が利用されない設計**:
 * - `sourceAdapterFactory` / `audioPreprocessor` は必須 DI (default なし)
 * - production entrypoint で対応する infrastructure adapter を明示的に渡す
 *
 * 注: pause / resume は MVP の scope 外。Relay gateway 側のセッション
 * 状態変更で実現する (AudioContext suspend は AudioPreprocessor の
 * port interface に現時点では存在しない)。
 */
export type CaptureOrchestrator = Readonly<{
  connect: (command: StartSourceCommand) => ResultAsync<ActiveCapture, DomainError>;
  disconnect: (sessionIdentifier: SessionIdentifier) => ResultAsync<void, DomainError>;
}>;

export const createCaptureOrchestrator = (
  deps: CaptureOrchestratorDependencies,
): CaptureOrchestrator => {
  const active = new Map<SessionIdentifier, ActiveCapture>();

  return {
    connect: (command) => {
      const adapter = deps.sourceAdapterFactory.create(command.sourceType);
      return adapter.open(command).andThen((stream) =>
        deps.audioPreprocessor.attach(stream, command.sessionIdentifier).map((frameChannel) => {
          const capture: ActiveCapture = {
            sessionIdentifier: command.sessionIdentifier,
            sourceType: command.sourceType,
            stream,
            frameChannel,
          };
          active.set(command.sessionIdentifier, capture);
          return capture;
        }),
      );
    },
    disconnect: (sessionIdentifier) => {
      const capture = active.get(sessionIdentifier);
      if (capture === undefined) return okAsync<void, DomainError>(undefined);
      active.delete(sessionIdentifier);
      capture.frameChannel.close();
      const adapter = deps.sourceAdapterFactory.create(capture.sourceType);
      return deps.audioPreprocessor
        .detach(sessionIdentifier)
        .andThen(() => adapter.close(sessionIdentifier));
    },
  };
};
