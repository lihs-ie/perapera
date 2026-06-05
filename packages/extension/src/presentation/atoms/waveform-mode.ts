/**
 * Waveform の表示モード (perapera-waveform.jsx の `mode` prop と完全一致)。
 *
 * - live          — animated bars, teal, signal flowing
 * - silent        — flat thin gray line with subtle drift
 * - degraded      — single gray-warn color, animated but muted
 * - reconnecting  — scanline animation across muted bars
 * - idle          — static dim baseline dots
 * - paused        — frozen sample, dimmed
 */

export const WAVEFORM_MODES = [
  'live',
  'silent',
  'degraded',
  'reconnecting',
  'idle',
  'paused',
] as const;

export type WaveformMode = (typeof WAVEFORM_MODES)[number];
