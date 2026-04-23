/**
 * IMPL-607 perapera-audio-processor (AudioWorkletProcessor).
 *
 * MV3 offscreen document の AudioContext (`audioWorklet.addModule(...)`) で
 * register され、capture 元 (chrome.tabCapture / getUserMedia / desktopCapture)
 * の MediaStreamTrack を `MediaStreamAudioSourceNode` 経由で受け取り、
 * 100ms ごとに次の前処理を行って `port.postMessage` で結果を offscreen 側へ
 * 送信する:
 *
 * 1. multi-channel input → mono 化 (各 channel の平均)
 * 2. AudioContext sampleRate (例 48kHz) → 16kHz 再サンプル (drop-by-N 簡易方式)
 * 3. 100ms バッファ (16000 * 0.1 = 1600 samples)
 * 4. Float32 → Int16 PCM (-1〜1 を -32768〜32767 にクランプ)
 * 5. Int16 binary → base64 文字列に encode
 * 6. `{ type: 'audio.frame', sequenceNumber, capturedAt, durationMs, sampleRate, channels, pcm16Base64 }` を post
 *
 * 受信側 (offscreen-audio-host) は AudioWorkletNode の `port.onmessage` で
 * フレームを受け取り、SW へ `chrome.runtime.sendMessage` で転送する想定。
 * SW 側は `audioFramePump` (IMPL-602) が既に sendAudioFrame へ drain する。
 *
 * 設計原則 (CLAUDE.md ホットパス §):
 * - 永続キューを挟まない (リアルタイム性最優先)
 * - 失敗時は console.warn + 継続 (例外を throw するとプロセッサ自体が停止する)
 *
 * 制約:
 * - AudioWorkletProcessor は ES Module 構文を使えるが、TypeScript は使えない
 * - 外部 import 不可 (Worklet の独立コンテキスト)
 * - registerProcessor の name 引数 'perapera-audio-processor' を offscreen 側と整合させる
 *
 * ロジック等価物の TypeScript 実装は
 * `packages/extension/src/infrastructure/audio/pcm-utils.ts` (IMPL-608) に
 * extract されており vitest で単体テスト済。worklet context は ES Module
 * import 制限のため本ファイル内で inline 複製する。ロジックを変更する際は
 * 両方を同期させること。
 */

const PROCESSOR_NAME = 'perapera-audio-processor';
const TARGET_SAMPLE_RATE_HZ = 16000;
const FRAME_DURATION_MS = 100;
const TARGET_FRAME_SAMPLES = (TARGET_SAMPLE_RATE_HZ * FRAME_DURATION_MS) / 1000;

const floatToPcm16 = (float32) => {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  return int16;
};

// AudioWorkletGlobalScope には `btoa` が存在しない (W3C 仕様上は
// Window/Worker のみ)。Chrome 検証でも ReferenceError になるため、pure JS の
// base64 エンコーダを inline 実装する。RFC 4648 §4 準拠、padding 付き。
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const int16ToBase64 = (int16) => {
  const bytes = new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
  let result = '';
  let i = 0;
  const len = bytes.length;
  while (i < len - 2) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    result += BASE64_ALPHABET[b0 >> 2];
    result += BASE64_ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)];
    result += BASE64_ALPHABET[((b1 & 0x0f) << 2) | (b2 >> 6)];
    result += BASE64_ALPHABET[b2 & 0x3f];
    i += 3;
  }
  // 末尾 1〜2 byte の padding
  if (i < len) {
    const b0 = bytes[i];
    result += BASE64_ALPHABET[b0 >> 2];
    if (i + 1 < len) {
      const b1 = bytes[i + 1];
      result += BASE64_ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)];
      result += BASE64_ALPHABET[(b1 & 0x0f) << 2];
      result += '=';
    } else {
      result += BASE64_ALPHABET[(b0 & 0x03) << 4];
      result += '==';
    }
  }
  return result;
};

class PeraperaAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = new Float32Array(TARGET_FRAME_SAMPLES);
    this._bufferOffset = 0;
    this._sequenceNumber = 0;
    // sampleRate はグローバル (W3C AudioWorklet 仕様)
    this._inputSampleRate = sampleRate;
    this._downsampleStep = Math.max(1, Math.round(this._inputSampleRate / TARGET_SAMPLE_RATE_HZ));
  }

  /**
   * @param {Float32Array[][]} inputs - inputs[port][channel] = Float32Array
   * @returns {boolean} - false で processor を停止、true で継続
   */
  process(inputs) {
    const input = inputs[0];
    if (input === undefined || input.length === 0) return true;

    const channelCount = input.length;
    const frameCount = input[0]?.length ?? 0;
    if (frameCount === 0) return true;

    for (let i = 0; i < frameCount; i += this._downsampleStep) {
      let sum = 0;
      for (let c = 0; c < channelCount; c += 1) {
        sum += input[c][i] ?? 0;
      }
      const monoSample = sum / channelCount;
      this._buffer[this._bufferOffset] = monoSample;
      this._bufferOffset += 1;

      if (this._bufferOffset >= TARGET_FRAME_SAMPLES) {
        this._flush();
      }
    }

    return true;
  }

  _flush() {
    try {
      const pcm16 = floatToPcm16(this._buffer);
      const pcm16Base64 = int16ToBase64(pcm16);
      this._sequenceNumber += 1;
      this.port.postMessage({
        type: 'audio.frame',
        sequenceNumber: this._sequenceNumber,
        capturedAt: new Date().toISOString(),
        durationMs: FRAME_DURATION_MS,
        sampleRate: TARGET_SAMPLE_RATE_HZ,
        channels: 1,
        pcm16Base64,
      });
    } catch (cause) {
      // Worklet コンテキストには console があるが、throw すると processor 停止
      console.warn('[perapera-audio-processor] flush failed:', cause);
    } finally {
      this._buffer = new Float32Array(TARGET_FRAME_SAMPLES);
      this._bufferOffset = 0;
    }
  }
}

registerProcessor(PROCESSOR_NAME, PeraperaAudioProcessor);
