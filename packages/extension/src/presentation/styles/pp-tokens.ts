/**
 * PP design tokens — `~/Downloads/PeraPera/perapera-ui.jsx` の `PP` / `PP_FONTS`
 * を TypeScript 定数として 1:1 で複写したもの。
 *
 * 用途:
 * - Waveform / Cursor / Glow など、CSS 変数だけでは表現しきれない動的計算
 *   (peak 色判定、rgba alpha 合成、box-shadow inline 書き込み) で参照する
 * - tokens.css 側の `--pp-*` カスタムプロパティと値が一致することを
 *   `tokens.test.ts` が contract として検査する
 */

export const PP = {
  bg: '#0a0e14',
  bgSoft: '#0e131b',
  surface: '#131924',
  surfaceRaised: '#1a212e',
  surfaceHi: '#222b3b',
  border: 'rgba(255,255,255,0.06)',
  borderStrong: 'rgba(255,255,255,0.13)',
  textPrimary: '#f1f5f9',
  textSecondary: '#cbd5e1',
  textMuted: '#7d8a9c',
  textDim: '#4d5867',
  accent: '#2dd4bf',
  accentBright: '#5eead4',
  accentDim: '#0d9488',
  accentSoft: 'rgba(45,212,191,0.14)',
  accentGlow: 'rgba(45,212,191,0.35)',
  accentFg: '#062b27',
  warn: '#f59e0b',
  warnSoft: 'rgba(245,158,11,0.14)',
  err: '#f87171',
  errSoft: 'rgba(248,113,113,0.14)',
  ok: '#34d399',
} as const;

export const PP_FONTS = {
  body: "'IBM Plex Sans JP', system-ui, -apple-system, 'Segoe UI', sans-serif",
  numeric: "'Space Grotesk', 'IBM Plex Sans JP', system-ui, sans-serif",
} as const;

export type PPColorKey = keyof typeof PP;
export type PPFontKey = keyof typeof PP_FONTS;
