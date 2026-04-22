import { defaultAudioContextFactory } from '../../infrastructure/audio/audio-preprocessor';
import { defaultTabStreamApi } from '../../infrastructure/audio/tab-stream-api';
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

const host = createOffscreenAudioHost({
  audioContextFactory: defaultAudioContextFactory,
  tabStreamApi: defaultTabStreamApi,
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
