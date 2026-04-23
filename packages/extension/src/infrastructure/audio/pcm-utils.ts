/**
 * IMPL-608 PCM 変換ユーティリティ関数。
 *
 * `perapera-audio-processor.js` (AudioWorkletProcessor) 内で使われるロジックを
 * pure function として extract。vitest で単体テスト可能にし、将来 offscreen
 * 側 AudioPreprocessor で再利用する余地を残す。
 *
 * worklet 側は独立 context (ES Module import 制限) のため、現時点では
 * 同一ロジックを inline で持つ。本ユーティリティは TypeScript 層での
 * duplicate reference 実装 + test fixture として機能する。
 *
 * 仕様:
 * - `pcm_s16le` / mono / 16kHz (api-specification.md §3.4)
 * - 100ms frame = 16000 * 0.1 = 1600 samples / frame
 */

/**
 * Float32 audio samples (-1〜1) を Int16 PCM (-32768〜32767) に変換する。
 * クランプで overflow を防ぎ、非対称な正負レンジ (Int16 は -32768〜32767) を
 * 扱うために負側は `× 0x8000`、正側は `× 0x7fff` でスケーリングする。
 */
export const floatToPcm16 = (float32: Float32Array): Int16Array => {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i += 1) {
    const sample = float32[i] ?? 0;
    const clamped = Math.max(-1, Math.min(1, sample));
    int16[i] = clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
  }
  return int16;
};

/**
 * Int16 PCM を Base64 文字列に encode する。
 *
 * AudioWorkletGlobalScope には `btoa` が**無い** (W3C 仕様上 Window/Worker のみ)
 * ため、pure JS の RFC 4648 §4 準拠エンコーダを実装する。worklet 側
 * (`packages/extension/src/public/perapera-audio-processor.js`) と同一ロジックで
 * mirror すること (両方とも import 禁止コンテキストのため 1:1 複製)。
 */
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export const int16ToBase64 = (int16: Int16Array): string => {
  const bytes = new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
  let result = '';
  let i = 0;
  const len = bytes.length;
  while (i < len - 2) {
    const b0 = bytes[i] ?? 0;
    const b1 = bytes[i + 1] ?? 0;
    const b2 = bytes[i + 2] ?? 0;
    result += BASE64_ALPHABET[b0 >> 2];
    result += BASE64_ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)];
    result += BASE64_ALPHABET[((b1 & 0x0f) << 2) | (b2 >> 6)];
    result += BASE64_ALPHABET[b2 & 0x3f];
    i += 3;
  }
  if (i < len) {
    const b0 = bytes[i] ?? 0;
    result += BASE64_ALPHABET[b0 >> 2];
    if (i + 1 < len) {
      const b1 = bytes[i + 1] ?? 0;
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

/**
 * AudioContext sampleRate (例 48000) から target 16000 への
 * drop-by-N 再サンプルステップを算出する。最低 1、それ以外は
 * 四捨五入した正の整数。
 */
export const downsampleStep = (inputSampleRate: number, targetSampleRate: number): number => {
  if (!Number.isFinite(inputSampleRate) || inputSampleRate <= 0) return 1;
  if (!Number.isFinite(targetSampleRate) || targetSampleRate <= 0) return 1;
  return Math.max(1, Math.round(inputSampleRate / targetSampleRate));
};

/**
 * 多 channel サンプル配列から mono サンプルを合成 (各 channel の平均)。
 * `channels[c][offset]` が undefined の場合は 0 として扱う。
 */
export const monoMix = (channels: readonly Float32Array[], offset: number): number => {
  if (channels.length === 0) return 0;
  let sum = 0;
  for (const channel of channels) {
    sum += channel[offset] ?? 0;
  }
  return sum / channels.length;
};

/** 100ms フレームの target サンプル数 (16kHz 固定) */
export const TARGET_SAMPLE_RATE_HZ = 16000;
export const FRAME_DURATION_MS = 100;
export const TARGET_FRAME_SAMPLES = (TARGET_SAMPLE_RATE_HZ * FRAME_DURATION_MS) / 1000;
