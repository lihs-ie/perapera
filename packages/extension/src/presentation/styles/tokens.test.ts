import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PP, PP_FONTS } from './pp-tokens';

const tokensPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), './tokens.css');
const fontsPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), './fonts.css');
const keyframesPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), './keyframes.css');

describe('design system tokens.css (PP design tokens)', () => {
  const tokens = readFileSync(tokensPath, 'utf8');

  it('declares PP surface tokens', () => {
    expect(tokens).toContain('--pp-bg: #0a0e14');
    expect(tokens).toContain('--pp-bg-soft: #0e131b');
    expect(tokens).toContain('--pp-surface: #131924');
    expect(tokens).toContain('--pp-surface-raised: #1a212e');
    expect(tokens).toContain('--pp-surface-hi: #222b3b');
  });

  it('declares PP border tokens', () => {
    expect(tokens).toContain('--pp-border: rgba(255,255,255,0.06)');
    expect(tokens).toContain('--pp-border-strong: rgba(255,255,255,0.13)');
  });

  it('declares PP text tokens', () => {
    expect(tokens).toContain('--pp-text-primary: #f1f5f9');
    expect(tokens).toContain('--pp-text-secondary: #cbd5e1');
    expect(tokens).toContain('--pp-text-muted: #7d8a9c');
    expect(tokens).toContain('--pp-text-dim: #4d5867');
  });

  it('declares PP accent tokens', () => {
    expect(tokens).toContain('--pp-accent: #2dd4bf');
    expect(tokens).toContain('--pp-accent-bright: #5eead4');
    expect(tokens).toContain('--pp-accent-dim: #0d9488');
    expect(tokens).toContain('--pp-accent-soft: rgba(45,212,191,0.14)');
    expect(tokens).toContain('--pp-accent-glow: rgba(45,212,191,0.35)');
    expect(tokens).toContain('--pp-accent-fg: #062b27');
  });

  it('declares PP state tokens', () => {
    expect(tokens).toContain('--pp-warn: #f59e0b');
    expect(tokens).toContain('--pp-warn-soft: rgba(245,158,11,0.14)');
    expect(tokens).toContain('--pp-err: #f87171');
    expect(tokens).toContain('--pp-err-soft: rgba(248,113,113,0.14)');
    expect(tokens).toContain('--pp-ok: #34d399');
  });

  it('declares font families with IBM Plex Sans JP and Space Grotesk', () => {
    expect(tokens).toContain("'IBM Plex Sans JP'");
    expect(tokens).toContain("'Space Grotesk'");
    expect(tokens).toContain('system-ui');
  });

  it('declares the 6-step spacing scale', () => {
    expect(tokens).toContain('--space-xs: 4px');
    expect(tokens).toContain('--space-sm: 8px');
    expect(tokens).toContain('--space-md: 12px');
    expect(tokens).toContain('--space-lg: 16px');
    expect(tokens).toContain('--space-xl: 24px');
    expect(tokens).toContain('--space-2xl: 32px');
  });

  it('declares PP radius scale (xs/sm/md/lg/xl/pill)', () => {
    expect(tokens).toContain('--pp-radius-xs: 2px');
    expect(tokens).toContain('--pp-radius-sm: 4px');
    expect(tokens).toContain('--pp-radius-md: 6px');
    expect(tokens).toContain('--pp-radius-lg: 8px');
    expect(tokens).toContain('--pp-radius-xl: 12px');
    expect(tokens).toContain('--pp-radius-pill: 999px');
  });

  it('forces dark color scheme (no @media prefers-color-scheme)', () => {
    expect(tokens).toContain('color-scheme: dark');
    expect(tokens).not.toMatch(/@media \(prefers-color-scheme: dark\)/);
  });

  it('does not declare legacy --color-* aliases (removed in Phase I)', () => {
    expect(tokens).not.toContain('--color-accent:');
    expect(tokens).not.toContain('--color-bg:');
    expect(tokens).not.toContain('--color-primary:');
  });
});

describe('pp-tokens.ts ↔ tokens.css contract (PP values must match verbatim)', () => {
  const tokens = readFileSync(tokensPath, 'utf8');

  it('all PP color values appear verbatim in tokens.css', () => {
    expect(tokens).toContain(PP.bg);
    expect(tokens).toContain(PP.bgSoft);
    expect(tokens).toContain(PP.surface);
    expect(tokens).toContain(PP.surfaceRaised);
    expect(tokens).toContain(PP.surfaceHi);
    expect(tokens).toContain(PP.border);
    expect(tokens).toContain(PP.borderStrong);
    expect(tokens).toContain(PP.textPrimary);
    expect(tokens).toContain(PP.textSecondary);
    expect(tokens).toContain(PP.textMuted);
    expect(tokens).toContain(PP.textDim);
    expect(tokens).toContain(PP.accent);
    expect(tokens).toContain(PP.accentBright);
    expect(tokens).toContain(PP.accentDim);
    expect(tokens).toContain(PP.accentSoft);
    expect(tokens).toContain(PP.accentGlow);
    expect(tokens).toContain(PP.accentFg);
    expect(tokens).toContain(PP.warn);
    expect(tokens).toContain(PP.warnSoft);
    expect(tokens).toContain(PP.err);
    expect(tokens).toContain(PP.errSoft);
    expect(tokens).toContain(PP.ok);
  });

  it('PP_FONTS body and numeric stacks appear in tokens.css', () => {
    expect(tokens).toContain('IBM Plex Sans JP');
    expect(tokens).toContain('Space Grotesk');
    // PP_FONTS の引用符スタイルは TS 上だが、tokens.css でも同一フォント名で参照
    expect(PP_FONTS.body).toContain('IBM Plex Sans JP');
    expect(PP_FONTS.numeric).toContain('Space Grotesk');
  });

  it('PP exposes exactly 22 color tokens', () => {
    expect(Object.keys(PP)).toHaveLength(22);
  });

  it('PP_FONTS exposes body and numeric font stacks', () => {
    expect(Object.keys(PP_FONTS)).toEqual(['body', 'numeric']);
  });
});

describe('design system keyframes.css', () => {
  const keyframes = readFileSync(keyframesPath, 'utf8');

  it('declares pp-pulse / pp-cursor / pp-fade-up keyframes', () => {
    expect(keyframes).toContain('@keyframes pp-pulse');
    expect(keyframes).toContain('@keyframes pp-cursor');
    expect(keyframes).toContain('@keyframes pp-fade-up');
  });

  it('pp-pulse animates scale 1 → 2.2 with opacity fade', () => {
    expect(keyframes).toContain('transform: scale(1)');
    expect(keyframes).toContain('transform: scale(2.2)');
    expect(keyframes).toContain('opacity: 0.5');
    expect(keyframes).toContain('opacity: 0');
  });

  it('pp-cursor toggles opacity at 50% boundary', () => {
    expect(keyframes).toMatch(/0%,\s*50%/);
    expect(keyframes).toMatch(/51%,\s*100%/);
  });
});

describe('design system fonts.css (IMPL-591)', () => {
  const fonts = readFileSync(fontsPath, 'utf8');

  it('imports IBM Plex Sans JP + Space Grotesk from Google Fonts', () => {
    expect(fonts).toContain('IBM+Plex+Sans+JP');
    expect(fonts).toContain('Space+Grotesk');
    expect(fonts).toContain('display=swap');
  });
});
