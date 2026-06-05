import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Waveform, classifyAudioLevel } from './waveform';

describe('Waveform atom (perapera-waveform.jsx Waveform 移植)', () => {
  it('renders the requested number of bars in idle mode (no raf needed)', () => {
    const { container } = render(<Waveform mode="idle" bars={12} height={20} />);
    const bars = container.querySelectorAll('[data-bar-index]');
    expect(bars).toHaveLength(12);
  });

  it('default bars=56 and height=36', () => {
    const { container } = render(<Waveform mode="idle" />);
    const root = container.firstChild as HTMLElement;
    expect(root.style.height).toBe('36px');
    expect(container.querySelectorAll('[data-bar-index]')).toHaveLength(56);
  });

  it('exposes data-mode for state mapping', () => {
    const { container } = render(<Waveform mode="degraded" bars={4} />);
    const root = container.firstChild as HTMLElement;
    expect(root.dataset.mode).toBe('degraded');
  });

  it('renders silent baseline overlay only when mode=silent', () => {
    const { container, rerender } = render(<Waveform mode="silent" bars={4} />);
    expect(container.querySelector('[data-part="silent-baseline"]')).not.toBeNull();
    rerender(<Waveform mode="idle" bars={4} />);
    expect(container.querySelector('[data-part="silent-baseline"]')).toBeNull();
  });

  it('idle mode: all bars share 0.22 opacity and 2px clamped height', () => {
    const { container } = render(<Waveform mode="idle" bars={4} height={50} />);
    const bars = container.querySelectorAll<HTMLElement>('[data-bar-index]');
    bars.forEach((bar) => {
      expect(bar.style.opacity).toBe('0.22');
      // h=0.04 → barH = max(2, 0.04 * 50) = max(2, 2) = 2
      expect(bar.style.height).toBe('2px');
    });
  });

  it('paused mode: applies 200ms transition for graceful freeze', () => {
    const { container } = render(<Waveform mode="paused" bars={4} />);
    const bars = container.querySelectorAll<HTMLElement>('[data-bar-index]');
    expect(bars[0]?.style.transition).toContain('200ms');
  });

  it('non-paused modes: no transition (immediate frame update)', () => {
    const { container } = render(<Waveform mode="idle" bars={4} />);
    const bar = container.querySelector<HTMLElement>('[data-bar-index]');
    expect(bar?.style.transition).toBe('none');
  });

  it('uses currentColor-style CSS variables (var(--pp-*)) for base color', () => {
    const { container } = render(<Waveform mode="idle" bars={1} />);
    const bar = container.querySelector<HTMLElement>('[data-bar-index]');
    expect(bar?.style.background).toContain('var(--pp-text-dim)');
  });

  it('color prop overrides the mode default base color', () => {
    const { container } = render(<Waveform mode="idle" bars={1} color="var(--pp-accent)" />);
    const bar = container.querySelector<HTMLElement>('[data-bar-index]');
    expect(bar?.style.background).toContain('var(--pp-accent)');
  });

  it('exposes role=img and aria-label for screen readers', () => {
    const { container } = render(<Waveform mode="idle" bars={1} />);
    const root = container.firstChild as HTMLElement;
    expect(root.getAttribute('role')).toBe('img');
    expect(root.getAttribute('aria-label')).toBe('音声波形');
  });

  describe('audio level color classification (live mode)', () => {
    it('audioLevel < 0.05 paints bars warn (low) and exposes data-level=low', () => {
      const { container } = render(<Waveform mode="live" bars={1} audioLevel={0.02} />);
      const root = container.firstChild as HTMLElement;
      expect(root.dataset.level).toBe('low');
      const bar = container.querySelector<HTMLElement>('[data-bar-index]');
      expect(bar?.style.background).toContain('var(--pp-warn)');
    });

    it('audioLevel in [0.05, 0.4) paints bars accent (optimal)', () => {
      const { container } = render(<Waveform mode="live" bars={1} audioLevel={0.2} />);
      const root = container.firstChild as HTMLElement;
      expect(root.dataset.level).toBe('optimal');
      const bar = container.querySelector<HTMLElement>('[data-bar-index]');
      expect(bar?.style.background).toContain('var(--pp-accent)');
    });

    it('audioLevel >= 0.4 paints bars err (high)', () => {
      const { container } = render(<Waveform mode="live" bars={1} audioLevel={0.5} />);
      const root = container.firstChild as HTMLElement;
      expect(root.dataset.level).toBe('high');
      const bar = container.querySelector<HTMLElement>('[data-bar-index]');
      expect(bar?.style.background).toContain('var(--pp-err)');
    });

    it('explicit level prop bypasses audioLevel-based classification', () => {
      const { container } = render(
        <Waveform mode="live" bars={1} audioLevel={0.02} level="optimal" />,
      );
      const bar = container.querySelector<HTMLElement>('[data-bar-index]');
      expect(bar?.style.background).toContain('var(--pp-accent)');
    });

    it('without audioLevel/level, defaults to optimal in live mode', () => {
      const { container } = render(<Waveform mode="live" bars={1} />);
      const root = container.firstChild as HTMLElement;
      expect(root.dataset.level).toBe('optimal');
    });

    it('non-live modes do not expose data-level (level mapping not applied)', () => {
      const { container } = render(<Waveform mode="idle" bars={1} audioLevel={0.5} />);
      const root = container.firstChild as HTMLElement;
      expect(root.dataset.level).toBeUndefined();
    });
  });
});

describe('classifyAudioLevel helper', () => {
  it('returns low when rms < 0.05', () => {
    expect(classifyAudioLevel(0)).toBe('low');
    expect(classifyAudioLevel(0.049)).toBe('low');
  });

  it('returns optimal in [0.05, 0.4)', () => {
    expect(classifyAudioLevel(0.05)).toBe('optimal');
    expect(classifyAudioLevel(0.2)).toBe('optimal');
    expect(classifyAudioLevel(0.399)).toBe('optimal');
  });

  it('returns high at or above 0.4', () => {
    expect(classifyAudioLevel(0.4)).toBe('high');
    expect(classifyAudioLevel(0.9)).toBe('high');
  });
});
