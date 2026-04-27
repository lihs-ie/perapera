import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusPill } from './status-pill';

describe('StatusPill atom (perapera-ui.jsx StatusPill 移植)', () => {
  it('shows CAPTURING label for capturing state with pulse=true', () => {
    render(<StatusPill state="capturing" />);
    const pill = screen.getByRole('status');
    expect(pill).toHaveTextContent('CAPTURING');
    expect(pill).toHaveAttribute('data-pulse', 'true');
    expect(pill).toHaveAttribute('data-state', 'capturing');
  });

  it('shows TRANSLATING for translating', () => {
    render(<StatusPill state="translating" />);
    expect(screen.getByRole('status')).toHaveTextContent('TRANSLATING');
  });

  it('shows TRANSCRIBING for transcribing', () => {
    render(<StatusPill state="transcribing" />);
    expect(screen.getByRole('status')).toHaveTextContent('TRANSCRIBING');
  });

  it('shows DEGRADED for degraded with pulse=false', () => {
    render(<StatusPill state="degraded" />);
    const pill = screen.getByRole('status');
    expect(pill).toHaveTextContent('DEGRADED');
    expect(pill).toHaveAttribute('data-pulse', 'false');
  });

  it('shows RECONNECTING for reconnecting with pulse=true', () => {
    render(<StatusPill state="reconnecting" />);
    const pill = screen.getByRole('status');
    expect(pill).toHaveTextContent('RECONNECTING');
    expect(pill).toHaveAttribute('data-pulse', 'true');
  });

  it('shows ERROR for error', () => {
    render(<StatusPill state="error" />);
    expect(screen.getByRole('status')).toHaveTextContent('ERROR');
  });

  it('shows IDLE label and falls back to idle for unknown state', () => {
    render(<StatusPill state="zzz-unknown" />);
    expect(screen.getByRole('status')).toHaveTextContent('IDLE');
  });

  it('size=sm uses smaller padding (data-size=sm)', () => {
    render(<StatusPill state="capturing" size="sm" />);
    expect(screen.getByRole('status')).toHaveAttribute('data-size', 'sm');
  });

  it('size=md is the default (data-size=md)', () => {
    render(<StatusPill state="capturing" />);
    expect(screen.getByRole('status')).toHaveAttribute('data-size', 'md');
  });

  it('respects custom label override', () => {
    render(<StatusPill state="capturing" label="LIVE" />);
    expect(screen.getByRole('status')).toHaveTextContent('LIVE');
  });

  it('renders the pulse halo only when variant.pulse=true', () => {
    const { container, rerender } = render(<StatusPill state="capturing" />);
    const halos = container.querySelectorAll('[data-part="dot"] > span');
    expect(halos.length).toBe(2);
    rerender(<StatusPill state="degraded" />);
    expect(container.querySelectorAll('[data-part="dot"] > span').length).toBe(1);
  });
});
