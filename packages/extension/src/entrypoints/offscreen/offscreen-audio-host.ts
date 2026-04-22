import {
  type AudioContextFactory,
  type AudioContextLike,
} from '../../infrastructure/audio/audio-preprocessor';
import { type TabStreamApi } from '../../infrastructure/audio/tab-stream-api';
import { describeDomainError } from '../../domain/shared/errors';
import { type SessionIdentifier } from '../../domain/session/session-identifier';
import { type OffscreenCommand } from './offscreen-commands';

/**
 * IMPL-561 Offscreen Audio Host。
 *
 * Background Service Worker から受信した `OffscreenCommand` に応じて
 * AudioContext と (tab source の場合) MediaStream を sessionId 単位で
 * open / close する lifecycle manager。
 *
 * **本番実装で mock を使わない設計**:
 * - `audioContextFactory` / `tabStreamApi` は必須 DI。production entrypoint で
 *   `defaultAudioContextFactory` / `defaultTabStreamApi` を明示注入、test では
 *   minimal stub を注入する
 * - AudioContext は sessionIdentifier → context の Map で保持。同一 session に
 *   複数回 open が来た場合は既存 context を再利用 (idempotent)
 *
 * MVP スコープ:
 * - IMPL-612: `tabStreamId` を受けた場合は `TabStreamApi.acquire` で MediaStream
 *   を確保し、AudioContext とセットで保持。close 時に `track.stop()` で解放
 * - 実際の PCM frame 転送 / AudioWorklet 配線は後続 step で追加
 */
export type OffscreenAudioHost = Readonly<{
  dispatch: (command: OffscreenCommand) => void;
  /** sessionId に対する AudioContext が現在確保されているか */
  has: (sessionIdentifier: SessionIdentifier) => boolean;
  /** sessionId に対する MediaStream が現在確保されているか (test/smoke 用) */
  hasStream: (sessionIdentifier: SessionIdentifier) => boolean;
  /** 登録中の全 AudioContext + MediaStream を破棄 (entry shutdown 用) */
  dispose: () => void;
}>;

export type OffscreenAudioHostDependencies = Readonly<{
  audioContextFactory: AudioContextFactory;
  /**
   * Optional。指定されたとき、`tabStreamId` 付きの `offscreen.audio.open` 受信で
   * MediaStream を解決する。未指定の場合は tabStreamId を無視 (後方互換)。
   */
  tabStreamApi?: TabStreamApi;
  /**
   * Optional。指定されたとき、AudioContext 作成直後に
   * `audioWorklet.addModule(workletModuleUrl)` を呼び出し、
   * `perapera-audio-processor` を register する。後続 step で
   * `AudioWorkletNode` を接続するための前段 (IMPL-614)。
   *
   * 未指定の場合は addModule を呼ばない (後方互換)。
   */
  workletModuleUrl?: string;
  /** 操作のログ sink。既定は console */
  logger?: Readonly<{
    debug: (message: string) => void;
    warn: (message: string) => void;
  }>;
}>;

const DEFAULT_LOGGER = {
  debug: (message: string): void => {
    console.debug(message);
  },
  warn: (message: string): void => {
    console.warn(message);
  },
};

const DEFAULT_SAMPLE_RATE = 16000 as const;

type ActiveEntry = Readonly<{
  context: AudioContextLike;
  mediaStream?: MediaStream;
}>;

const hasStopMethod = (value: unknown): value is { stop: () => void } => {
  if (typeof value !== 'object' || value === null) return false;
  const stop: unknown = Reflect.get(value, 'stop');
  return typeof stop === 'function';
};

const stopAllTracks = (stream: MediaStream): void => {
  for (const track of stream.getTracks()) {
    if (hasStopMethod(track)) track.stop();
  }
};

export const createOffscreenAudioHost = (
  deps: OffscreenAudioHostDependencies,
): OffscreenAudioHost => {
  const entries = new Map<SessionIdentifier, ActiveEntry>();
  const logger = deps.logger ?? DEFAULT_LOGGER;

  const attachMediaStream = (sessionIdentifier: SessionIdentifier, tabStreamId: string): void => {
    if (deps.tabStreamApi === undefined) {
      logger.debug(
        `[perapera] offscreen-audio-host skip MediaStream acquisition for ${sessionIdentifier} (tabStreamApi not injected)`,
      );
      return;
    }
    const existing = entries.get(sessionIdentifier);
    if (existing === undefined) return;
    void deps.tabStreamApi.acquire(tabStreamId).match(
      (mediaStream) => {
        // openContext と同期処理の間に close が入る可能性を考えて、取得時点の
        // 既存 entry をもう一度確認する
        const current = entries.get(sessionIdentifier);
        if (current === undefined || current !== existing) {
          stopAllTracks(mediaStream);
          logger.debug(
            `[perapera] offscreen-audio-host discard MediaStream — session ${sessionIdentifier} was closed mid-acquisition`,
          );
          return;
        }
        entries.set(sessionIdentifier, { ...current, mediaStream });
        logger.debug(
          `[perapera] offscreen-audio-host attached MediaStream for ${sessionIdentifier} (tracks=${String(mediaStream.getTracks().length)})`,
        );
      },
      (error) => {
        logger.warn(
          `[perapera] offscreen-audio-host tab-stream acquire failed for ${sessionIdentifier}: ${describeDomainError(
            error,
          )}`,
        );
      },
    );
  };

  const closeEntry = (sessionIdentifier: SessionIdentifier): void => {
    const entry = entries.get(sessionIdentifier);
    if (entry === undefined) return;
    entries.delete(sessionIdentifier);
    if (entry.mediaStream !== undefined) {
      stopAllTracks(entry.mediaStream);
    }
    void entry.context.close().catch((cause) => {
      logger.warn(
        `[perapera] offscreen-audio-host close failed for ${sessionIdentifier}: ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
      );
    });
  };

  const openEntry = (
    sessionIdentifier: SessionIdentifier,
    sampleRateHz?: number,
    tabStreamId?: string,
  ): void => {
    if (entries.has(sessionIdentifier)) {
      logger.debug(
        `[perapera] offscreen-audio-host re-use existing AudioContext for ${sessionIdentifier}`,
      );
      return;
    }
    try {
      const context = deps.audioContextFactory({
        sampleRate: sampleRateHz ?? DEFAULT_SAMPLE_RATE,
      });
      entries.set(sessionIdentifier, { context });
      logger.debug(
        `[perapera] offscreen-audio-host opened AudioContext for ${sessionIdentifier} (sampleRate=${String(context.sampleRate)})`,
      );
      if (deps.workletModuleUrl !== undefined) {
        const moduleUrl = deps.workletModuleUrl;
        void context.audioWorklet.addModule(moduleUrl).then(
          () => {
            logger.debug(
              `[perapera] offscreen-audio-host registered AudioWorklet module for ${sessionIdentifier}: ${moduleUrl}`,
            );
          },
          (cause: unknown) => {
            logger.warn(
              `[perapera] offscreen-audio-host addModule failed for ${sessionIdentifier}: ${
                cause instanceof Error ? cause.message : String(cause)
              }`,
            );
          },
        );
      }
      if (tabStreamId !== undefined) {
        attachMediaStream(sessionIdentifier, tabStreamId);
      }
    } catch (cause) {
      logger.warn(
        `[perapera] offscreen-audio-host open failed for ${sessionIdentifier}: ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
      );
    }
  };

  return {
    dispatch: (command) => {
      switch (command.type) {
        case 'offscreen.ping':
          logger.debug('[perapera] offscreen-audio-host received ping');
          return;
        case 'offscreen.audio.open':
          openEntry(command.sessionIdentifier, command.sampleRateHz, command.tabStreamId);
          return;
        case 'offscreen.audio.close':
          closeEntry(command.sessionIdentifier);
          return;
      }
    },
    has: (sessionIdentifier) => entries.has(sessionIdentifier),
    hasStream: (sessionIdentifier) => entries.get(sessionIdentifier)?.mediaStream !== undefined,
    dispose: () => {
      for (const [sessionIdentifier] of entries) {
        closeEntry(sessionIdentifier);
      }
    },
  };
};
