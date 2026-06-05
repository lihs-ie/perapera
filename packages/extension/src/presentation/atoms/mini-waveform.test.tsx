import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MiniWaveform } from './mini-waveform';

describe('MiniWaveform atom (perapera-waveform.jsx MiniWaveform 移植)', () => {
  it('wraps Waveform in a 60px-wide container', () => {
    const { container } = render(<MiniWaveform mode="idle" />);
    const root = container.firstChild as HTMLElement;
    expect(root.style.width).toBe('60px');
  });

  it('default bars=18 and height=14', () => {
    const { container } = render(<MiniWaveform mode="idle" />);
    expect(container.querySelectorAll('[data-bar-index]')).toHaveLength(18);
    const waveform = container.querySelector('[data-component="waveform"]') as HTMLElement;
    expect(waveform.style.height).toBe('14px');
  });

  it('passes mode to Waveform', () => {
    const { container } = render(<MiniWaveform mode="degraded" />);
    const waveform = container.querySelector('[data-component="waveform"]') as HTMLElement;
    expect(waveform.dataset.mode).toBe('degraded');
  });
});
