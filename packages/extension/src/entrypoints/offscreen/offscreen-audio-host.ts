import {
  type AudioContextFactory,
  type AudioContextLike,
} from '../../infrastructure/audio/audio-preprocessor';
import { type TabStreamApi } from '../../infrastructure/audio/tab-stream-api';
import {
  type AudioWorkletNodeLike,
  type WorkletNodeFactory,
} from '../../infrastructure/audio/worklet-node-factory';
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
  /** sessionId に対する AudioWorkletNode が接続済か (test/smoke 用, IMPL-616) */
  hasWorkletConnected: (sessionIdentifier: SessionIdentifier) => boolean;
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
  /**
   * Optional。`tabStreamApi` + `workletModuleUrl` と揃って注入された場合、
   * addModule 完了 + MediaStream 取得後に本 factory で AudioWorkletNode を
   * 作成し、`MediaStreamAudioSourceNode.connect(workletNode)` で接続する
   * (IMPL-616)。frame port.onmessage の配線は後続 step で実装。
   *
   * 未指定の場合は MediaStream だけを保持 (後方互換)。
   */
  workletNodeFactory?: WorkletNodeFactory;
  /** Worklet processor 名 (default `'perapera-audio-processor'`) */
  workletProcessorName?: string;
  /**
   * Optional。AudioWorkletNode.port.onmessage で受信した frame data を上位層
   * (通常は chrome.runtime.sendMessage 経由で SW へ転送) に引き渡す callback
   * (IMPL-617)。`data` は worklet processor が `port.postMessage` で送る任意
   * object (通常 `{ type: 'audio.frame', pcm16Base64, sequenceNumber, ... }`)。
   */
  onAudioFrame?: (sessionIdentifier: SessionIdentifier, data: unknown) => void;
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
const DEFAULT_WORKLET_PROCESSOR_NAME = 'perapera-audio-processor';

/**
 * source node は Web Audio API の standard AudioNode 実装 (production の
 * `MediaStreamAudioSourceNode`)。structural type で connect / disconnect の
 * minimal contract のみ表現。offscreen-audio-host 内でのみ利用。
 */
type SourceNodeLike = Readonly<{
  connect: (destination: unknown) => void;
  disconnect: () => void;
}>;

type ActiveEntry = Readonly<{
  context: AudioContextLike;
  mediaStream?: MediaStream;
  sourceNode?: SourceNodeLike;
  workletNode?: AudioWorkletNodeLike;
  /**
   * addModule の結果。resolve 型は `boolean` (成功 true / 失敗 false)。
   * rejection を握りつぶして unhandled rejection を防ぐ設計。
   */
  workletModuleReadyPromise?: Promise<boolean>;
}>;

/**
 * `context.createMediaStreamSource` の戻り値 (型: unknown) を SourceNodeLike
 * に narrowing。production では MediaStreamAudioSourceNode (AudioNode) が
 * 返され、connect/disconnect を持つため安全に呼べる。
 */
const asSourceNode = (raw: unknown): SourceNodeLike => {
  if (typeof raw !== 'object' || raw === null) {
    throw new TypeError(
      '[perapera] offscreen-audio-host: createMediaStreamSource returned a non-object value',
    );
  }
  const connect: unknown = Reflect.get(raw, 'connect');
  const disconnect: unknown = Reflect.get(raw, 'disconnect');
  if (typeof connect !== 'function' || typeof disconnect !== 'function') {
    throw new TypeError(
      '[perapera] offscreen-audio-host: createMediaStreamSource returned an object without connect/disconnect',
    );
  }
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return raw as SourceNodeLike;
};

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

  const connectWorklet = (sessionIdentifier: SessionIdentifier, mediaStream: MediaStream): void => {
    if (deps.workletNodeFactory === undefined) return;
    const entry = entries.get(sessionIdentifier);
    if (entry === undefined) return;
    try {
      const sourceNode = asSourceNode(entry.context.createMediaStreamSource(mediaStream));
      const workletNode = deps.workletNodeFactory(
        entry.context,
        deps.workletProcessorName ?? DEFAULT_WORKLET_PROCESSOR_NAME,
      );
      sourceNode.connect(workletNode);
      // IMPL-617: worklet processor から送られてくる frame を上位層 (SW) に
      // 転送する。onAudioFrame callback が注入されているときのみ listener を
      // 設定。callback 例外で listener が外れないよう try/catch で囲む。
      if (deps.onAudioFrame !== undefined) {
        const forward = deps.onAudioFrame;
        workletNode.port.onmessage = (event): void => {
          try {
            forward(sessionIdentifier, event.data);
          } catch (cause) {
            logger.warn(
              `[perapera] offscreen-audio-host onAudioFrame threw for ${sessionIdentifier}: ${
                cause instanceof Error ? cause.message : String(cause)
              }`,
            );
          }
        };
      }
      entries.set(sessionIdentifier, { ...entry, sourceNode, workletNode });
      logger.debug(
        `[perapera] offscreen-audio-host connected MediaStreamAudioSourceNode → AudioWorkletNode for ${sessionIdentifier}`,
      );
    } catch (cause) {
      logger.warn(
        `[perapera] offscreen-audio-host worklet connect failed for ${sessionIdentifier}: ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
      );
    }
  };

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
        // acquire 完了までの間に close が入った可能性を確認
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
        // worklet 接続は addModule 完了後 (成功時のみ)
        const workletReadyPromise = current.workletModuleReadyPromise;
        if (workletReadyPromise !== undefined) {
          void workletReadyPromise.then((success) => {
            if (!success) return;
            // 再度 entry 存在確認 (close 可能性)
            const afterModule = entries.get(sessionIdentifier);
            if (afterModule === undefined) return;
            connectWorklet(sessionIdentifier, mediaStream);
          });
        } else {
          connectWorklet(sessionIdentifier, mediaStream);
        }
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
    // Worklet / source の disconnect を先に呼んで audio graph を切る
    if (entry.sourceNode !== undefined) {
      try {
        entry.sourceNode.disconnect();
      } catch {
        /* すでに disconnect 済など — 無視 */
      }
    }
    if (entry.workletNode !== undefined) {
      try {
        entry.workletNode.disconnect();
      } catch {
        /* すでに disconnect 済など — 無視 */
      }
    }
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
      let workletModuleReadyPromise: Promise<boolean> | undefined;
      if (deps.workletModuleUrl !== undefined) {
        const moduleUrl = deps.workletModuleUrl;
        workletModuleReadyPromise = context.audioWorklet.addModule(moduleUrl).then(
          (): boolean => {
            logger.debug(
              `[perapera] offscreen-audio-host registered AudioWorklet module for ${sessionIdentifier}: ${moduleUrl}`,
            );
            return true;
          },
          (cause: unknown): boolean => {
            logger.warn(
              `[perapera] offscreen-audio-host addModule failed for ${sessionIdentifier}: ${
                cause instanceof Error ? cause.message : String(cause)
              }`,
            );
            return false;
          },
        );
      }
      entries.set(
        sessionIdentifier,
        workletModuleReadyPromise !== undefined
          ? { context, workletModuleReadyPromise }
          : { context },
      );
      logger.debug(
        `[perapera] offscreen-audio-host opened AudioContext for ${sessionIdentifier} (sampleRate=${String(context.sampleRate)})`,
      );
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
    hasWorkletConnected: (sessionIdentifier) =>
      entries.get(sessionIdentifier)?.workletNode !== undefined,
    dispose: () => {
      for (const [sessionIdentifier] of entries) {
        closeEntry(sessionIdentifier);
      }
    },
  };
};
