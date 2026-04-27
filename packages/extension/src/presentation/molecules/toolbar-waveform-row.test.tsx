import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ToolbarWaveformRow } from './toolbar-waveform-row';

describe('ToolbarWaveformRow molecule (perapera-toolbar.jsx waveform row 移植)', () => {
  it('shows LIVE label for optimal-level live mode', () => {
    render(<ToolbarWaveformRow mode="live" audioLevel={0.2} />);
    expect(screen.getByText('LIVE')).toBeInTheDocument();
    // dB: −12 + 0.2*6 = −10.8
    expect(screen.getByText('−10.8dB')).toBeInTheDocument();
  });

  it('shows LOW label when audioLevel is below 0.05', () => {
    render(<ToolbarWaveformRow mode="live" audioLevel={0.02} />);
    expect(screen.getByText('LOW')).toBeInTheDocument();
  });

  it('shows HIGH label when audioLevel is at or above 0.4', () => {
    render(<ToolbarWaveformRow mode="live" audioLevel={0.5} />);
    expect(screen.getByText('HIGH')).toBeInTheDocument();
  });

  it('exposes data-level on root for low/optimal/high in live mode', () => {
    const { container, rerender } = render(<ToolbarWaveformRow mode="live" audioLevel={0.02} />);
    const root = container.firstChild as HTMLElement;
    expect(root.dataset.level).toBe('low');
    rerender(<ToolbarWaveformRow mode="live" audioLevel={0.2} />);
    expect(root.dataset.level).toBe('optimal');
    rerender(<ToolbarWaveformRow mode="live" audioLevel={0.5} />);
    expect(root.dataset.level).toBe('high');
  });

  it('shows NO SIG and −∞ dB for silent mode', () => {
    render(<ToolbarWaveformRow mode="silent" audioLevel={0} />);
    expect(screen.getByText('NO SIG')).toBeInTheDocument();
    expect(screen.getByText('−∞ dB')).toBeInTheDocument();
  });

  it('shows STT.ONLY for degraded mode', () => {
    render(<ToolbarWaveformRow mode="degraded" audioLevel={0.5} />);
    expect(screen.getByText('STT.ONLY')).toBeInTheDocument();
  });

  it('shows RETRY for reconnecting mode', () => {
    render(<ToolbarWaveformRow mode="reconnecting" audioLevel={0.5} />);
    expect(screen.getByText('RETRY')).toBeInTheDocument();
  });

  it('shows IDLE and — dB for idle mode', () => {
    render(<ToolbarWaveformRow mode="idle" audioLevel={0} />);
    expect(screen.getByText('IDLE')).toBeInTheDocument();
    expect(screen.getByText('— dB')).toBeInTheDocument();
  });

  it('embeds a Waveform with default 56 bars / height 32', () => {
    const { container } = render(<ToolbarWaveformRow mode="idle" audioLevel={0} />);
    const waveform = container.querySelector('[data-component="waveform"]') as HTMLElement;
    expect(waveform.style.height).toBe('32px');
    expect(container.querySelectorAll('[data-bar-index]')).toHaveLength(56);
  });
});
