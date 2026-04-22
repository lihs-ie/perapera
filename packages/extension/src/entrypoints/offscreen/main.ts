import { defaultAudioContextFactory } from '../../infrastructure/audio/audio-preprocessor';
import { defaultTabStreamApi } from '../../infrastructure/audio/tab-stream-api';
import { defaultWorkletNodeFactory } from '../../infrastructure/audio/worklet-node-factory';
import { createOffscreenAudioHost } from './offscreen-audio-host';
import { parseOffscreenCommand } from './offscreen-commands';

/**
 * IMPL-562 Offscreen document entry。
 *
 * Service Worker からの `OffscreenCommand` を chrome.runtime.onMessage で受け、
 * `OffscreenAudioHost` で AudioContext を lifecycle 管理する。MV3 の SW は
 * `new AudioContext()` を呼べないため、offscreen document が代理で保持する。
 *
 * **本番実装で mock / in-memory を使わない原則**:
 * - `defaultAudioContextFactory` を明示注入 (production default)
 * - test では `createOffscreenAudioHost` に stub を入れる (entry 本体は real)
 *
 * MVP スコープ: AudioContext 確保までの shell。PCM 転送 / AudioWorklet 配線は
 * Phase 6 integration で追加予定。
 */
console.log('[perapera] offscreen document loaded');

const WORKLET_MODULE_URL = (() => {
  try {
    return chrome.runtime.getURL('/perapera-audio-processor.js');
  } catch {
    return '/perapera-audio-processor.js';
  }
})();

const host = createOffscreenAudioHost({
  audioContextFactory: defaultAudioContextFactory,
  tabStreamApi: defaultTabStreamApi,
  workletModuleUrl: WORKLET_MODULE_URL,
  workletNodeFactory: defaultWorkletNodeFactory,
  // IMPL-617: worklet frame を SW へ転送。chrome.runtime.sendMessage で
  // broadcast し、SW の audio.frame.forward listener が audioFramePump に流す。
  onAudioFrame: (sessionIdentifier, data) => {
    void chrome.runtime
      .sendMessage({
        type: 'audio.frame.forward',
        sessionIdentifier,
        data,
      })
      .catch((cause: unknown) => {
        console.warn(
          '[perapera] offscreen audio.frame.forward sendMessage failed:',
          cause instanceof Error ? cause.message : String(cause),
        );
      });
  },
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const parsed = parseOffscreenCommand(message);
  if (parsed.isErr()) {
    // OverlayCommand / BackgroundRequest など非 Offscreen メッセージも流入する
    // ため silent ignore。return false で async 応答しないことを宣言。
    return false;
  }
  host.dispatch(parsed.value);
  sendResponse({ ok: true });
  return false;
});

window.addEventListener('beforeunload', () => {
  host.dispose();
});
