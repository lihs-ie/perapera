import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const tokensPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), './tokens.css');
const fontsPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), './fonts.css');

describe('design system tokens.css (IMPL-590)', () => {
  const tokens = readFileSync(tokensPath, 'utf8');

  it('declares the 10 colors from ui-ux-design.md §3.1', () => {
    const required = [
      '--color-primary: #0f766e',
      '--color-secondary: #475569',
      '--color-success: #16a34a',
      '--color-warning: #ea580c',
      '--color-error: #dc2626',
      '--color-background: #f5f1e8',
      '--color-surface: #ffffff',
      '--color-surface-strong: #0f172a',
      '--color-text-primary: #111827',
      '--color-text-inverse: #f8fafc',
    ];
    for (const token of required) {
      expect(tokens).toContain(token);
    }
  });

  it('declares the typography scale (h1 / h2 / h3 / body / small)', () => {
    expect(tokens).toContain('--font-size-h1: 28px');
    expect(tokens).toContain('--font-size-h2: 22px');
    expect(tokens).toContain('--font-size-h3: 18px');
    expect(tokens).toContain('--font-size-body: 14px');
    expect(tokens).toContain('--font-size-small: 12px');
  });

  it('declares font families with IBM Plex Sans JP and Space Grotesk', () => {
    expect(tokens).toContain("'IBM Plex Sans JP'");
    expect(tokens).toContain("'Space Grotesk'");
    // system-ui fallback must exist so tokens still resolve when Google Fonts fail
    expect(tokens).toContain('system-ui');
  });

  it('declares the 6-step spacing scale (xs / sm / md / lg / xl / 2xl)', () => {
    expect(tokens).toContain('--space-xs: 4px');
    expect(tokens).toContain('--space-sm: 8px');
    expect(tokens).toContain('--space-md: 12px');
    expect(tokens).toContain('--space-lg: 16px');
    expect(tokens).toContain('--space-xl: 24px');
    expect(tokens).toContain('--space-2xl: 32px');
  });

  it('declares session state palette aliases (StatusBadge data-variant)', () => {
    expect(tokens).toContain('--color-state-active:');
    expect(tokens).toContain('--color-state-pending:');
    expect(tokens).toContain('--color-state-degraded:');
    expect(tokens).toContain('--color-state-error:');
    expect(tokens).toContain('--color-state-stopped:');
    expect(tokens).toContain('--color-state-neutral:');
  });

  it('preserves legacy aliases for incremental migration', () => {
    // 既存 stylesheet の移行猶予。すべて削除されたら本 test も除去
    expect(tokens).toContain('--color-accent:');
    expect(tokens).toContain('--color-danger:');
    expect(tokens).toContain('--color-bg:');
    expect(tokens).toContain('--color-text:');
  });

  it('applies dark mode via prefers-color-scheme media query', () => {
    expect(tokens).toMatch(/@media \(prefers-color-scheme: dark\)/);
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
