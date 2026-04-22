import {
  type AudioContextFactory,
  type AudioContextLike,
} from '../../infrastructure/audio/audio-preprocessor';
import { type SessionIdentifier } from '../../domain/session/session-identifier';
import { type OffscreenCommand } from './offscreen-commands';

/**
 * IMPL-561 Offscreen Audio Host。
 *
 * Background Service Worker から受信した `OffscreenCommand` に応じて
 * AudioContext を sessionId 単位で open / close する lifecycle manager。
 *
 * **本番実装で mock を使わない設計**:
 * - `audioContextFactory` は必須 DI。production entrypoint で
 *   `defaultAudioContextFactory` を明示注入、test では minimal stub を注入
 * - AudioContext は sessionIdentifier → context の Map で保持。同一 session に
 *   複数回 open が来た場合は既存 context を再利用 (idempotent)
 *
 * MVP スコープ:
 * - 実際の PCM frame 転送 / AudioWorklet 配線は Phase 6 integration で追加
 * - 本モジュールは「AudioContext を確保する」ところまで (SW と分離された DOM
 *   コンテキストで Audio API を使えるようにする土台)
 */
export type OffscreenAudioHost = Readonly<{
  dispatch: (command: OffscreenCommand) => void;
  /** sessionId に対する AudioContext が現在確保されているか */
  has: (sessionIdentifier: SessionIdentifier) => boolean;
  /** 登録中の全 AudioContext を破棄 (entry shutdown 用) */
  dispose: () => void;
}>;

export type OffscreenAudioHostDependencies = Readonly<{
  audioContextFactory: AudioContextFactory;
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

export const createOffscreenAudioHost = (
  deps: OffscreenAudioHostDependencies,
): OffscreenAudioHost => {
  const contexts = new Map<SessionIdentifier, AudioContextLike>();
  const logger = deps.logger ?? DEFAULT_LOGGER;

  const closeContext = (sessionIdentifier: SessionIdentifier): void => {
    const context = contexts.get(sessionIdentifier);
    if (context === undefined) return;
    contexts.delete(sessionIdentifier);
    void context.close().catch((cause) => {
      logger.warn(
        `[perapera] offscreen-audio-host close failed for ${sessionIdentifier}: ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
      );
    });
  };

  const openContext = (sessionIdentifier: SessionIdentifier, sampleRateHz?: number): void => {
    if (contexts.has(sessionIdentifier)) {
      logger.debug(
        `[perapera] offscreen-audio-host re-use existing AudioContext for ${sessionIdentifier}`,
      );
      return;
    }
    try {
      const context = deps.audioContextFactory({
        sampleRate: sampleRateHz ?? DEFAULT_SAMPLE_RATE,
      });
      contexts.set(sessionIdentifier, context);
      logger.debug(
        `[perapera] offscreen-audio-host opened AudioContext for ${sessionIdentifier} (sampleRate=${String(
          context.sampleRate,
        )})`,
      );
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
          openContext(command.sessionIdentifier, command.sampleRateHz);
          return;
        case 'offscreen.audio.close':
          closeContext(command.sessionIdentifier);
          return;
      }
    },
    has: (sessionIdentifier) => contexts.has(sessionIdentifier),
    dispose: () => {
      for (const [sessionIdentifier] of contexts) {
        closeContext(sessionIdentifier);
      }
    },
  };
};
