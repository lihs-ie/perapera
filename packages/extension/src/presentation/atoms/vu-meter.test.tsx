import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VuMeter } from './vu-meter';

describe('VuMeter atom (Issue #110)', () => {
  it('renders with the correct aria attributes', () => {
    render(<VuMeter rms={0.3} />);
    const meter = screen.getByRole('meter', { name: '音声レベル' });
    expect(meter).toHaveAttribute('aria-valuenow', '30');
    expect(meter).toHaveAttribute('aria-valuemin', '0');
    expect(meter).toHaveAttribute('aria-valuemax', '100');
  });

  it('clamps negative rms to 0', () => {
    render(<VuMeter rms={-0.5} />);
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '0');
  });

  it('clamps rms > 1 to 100', () => {
    render(<VuMeter rms={2} />);
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '100');
  });

  it('uses data-level="low" for rms below 0.2', () => {
    render(<VuMeter rms={0.1} />);
    expect(screen.getByRole('meter')).toHaveAttribute('data-level', 'low');
  });

  it('uses data-level="mid" for rms in [0.2, 0.5)', () => {
    render(<VuMeter rms={0.3} />);
    expect(screen.getByRole('meter')).toHaveAttribute('data-level', 'mid');
  });

  it('uses data-level="high" for rms >= 0.5', () => {
    render(<VuMeter rms={0.7} />);
    expect(screen.getByRole('meter')).toHaveAttribute('data-level', 'high');
  });

  it('treats NaN rms as 0', () => {
    render(<VuMeter rms={Number.NaN} />);
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '0');
  });
});
