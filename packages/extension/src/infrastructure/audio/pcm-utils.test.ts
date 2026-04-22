import { describe, expect, it } from 'vitest';
import {
  downsampleStep,
  floatToPcm16,
  FRAME_DURATION_MS,
  int16ToBase64,
  monoMix,
  TARGET_FRAME_SAMPLES,
  TARGET_SAMPLE_RATE_HZ,
} from './pcm-utils';

describe('floatToPcm16 (IMPL-608)', () => {
  it('converts zero samples to zero Int16', () => {
    const input = new Float32Array([0, 0, 0]);
    const result = floatToPcm16(input);
    expect(Array.from(result)).toEqual([0, 0, 0]);
  });

  it('maps 1.0 to 0x7fff (positive full scale)', () => {
    const result = floatToPcm16(new Float32Array([1.0]));
    expect(result[0]).toBe(0x7fff);
  });

  it('maps -1.0 to -0x8000 (negative full scale)', () => {
    const result = floatToPcm16(new Float32Array([-1.0]));
    expect(result[0]).toBe(-0x8000);
  });

  it('clamps out-of-range samples to Int16 boundaries', () => {
    const result = floatToPcm16(new Float32Array([2.0, -2.0, 1.5, -1.5]));
    expect(result[0]).toBe(0x7fff);
    expect(result[1]).toBe(-0x8000);
    expect(result[2]).toBe(0x7fff);
    expect(result[3]).toBe(-0x8000);
  });

  it('preserves intermediate magnitudes (0.5 ≈ 16384)', () => {
    const result = floatToPcm16(new Float32Array([0.5, -0.5]));
    expect(result[0]).toBe(Math.round(0.5 * 0x7fff));
    expect(result[1]).toBe(Math.round(-0.5 * 0x8000));
  });
});

describe('int16ToBase64 (IMPL-608)', () => {
  it('encodes known Int16 values into base64 little-endian bytes', () => {
    // 0x0001 (little-endian) = bytes [0x01, 0x00]
    const input = new Int16Array([1]);
    const encoded = int16ToBase64(input);
    // base64 of [0x01, 0x00] = "AQA="
    expect(encoded).toBe('AQA=');
  });

  it('round-trips through atob back to Int16', () => {
    const samples = new Int16Array([0, 1, -1, 0x7fff, -0x8000]);
    const encoded = int16ToBase64(samples);
    const decoded =
      typeof atob === 'function'
        ? atob(encoded)
        : Buffer.from(encoded, 'base64').toString('binary');
    expect(decoded.length).toBe(samples.byteLength);
    const restoredBytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i += 1) {
      restoredBytes[i] = decoded.charCodeAt(i);
    }
    const restored = new Int16Array(restoredBytes.buffer);
    expect(Array.from(restored)).toEqual(Array.from(samples));
  });

  it('produces empty string for empty input', () => {
    expect(int16ToBase64(new Int16Array(0))).toBe('');
  });
});

describe('downsampleStep (IMPL-608)', () => {
  it('returns 3 for 48kHz → 16kHz', () => {
    expect(downsampleStep(48000, 16000)).toBe(3);
  });

  it('returns 1 for input at or below target rate', () => {
    expect(downsampleStep(16000, 16000)).toBe(1);
    expect(downsampleStep(8000, 16000)).toBe(1);
  });

  it('rounds non-integer ratios', () => {
    // 44100 / 16000 = 2.75625 → round = 3
    expect(downsampleStep(44100, 16000)).toBe(3);
  });

  it('returns 1 for invalid inputs (defensive)', () => {
    expect(downsampleStep(0, 16000)).toBe(1);
    expect(downsampleStep(16000, 0)).toBe(1);
    expect(downsampleStep(Number.NaN, 16000)).toBe(1);
    expect(downsampleStep(-1, 16000)).toBe(1);
  });
});

describe('monoMix (IMPL-608)', () => {
  it('returns 0 when there are no channels', () => {
    expect(monoMix([], 0)).toBe(0);
  });

  it('passes through single-channel sample as-is', () => {
    const channel = new Float32Array([0.25]);
    expect(monoMix([channel], 0)).toBe(0.25);
  });

  it('averages two-channel samples', () => {
    const left = new Float32Array([0.4, 0.2]);
    const right = new Float32Array([0.2, 0.8]);
    expect(monoMix([left, right], 0)).toBeCloseTo(0.3, 5);
    expect(monoMix([left, right], 1)).toBeCloseTo(0.5, 5);
  });

  it('treats undefined samples as 0 (out-of-bounds defensive)', () => {
    const short = new Float32Array([0.5]);
    expect(monoMix([short], 1)).toBe(0);
  });
});

describe('frame constants (IMPL-608)', () => {
  it('exposes 16kHz / 100ms = 1600 samples per frame', () => {
    expect(TARGET_SAMPLE_RATE_HZ).toBe(16000);
    expect(FRAME_DURATION_MS).toBe(100);
    expect(TARGET_FRAME_SAMPLES).toBe(1600);
  });
});
