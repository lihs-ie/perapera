import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToggleSwitch } from './toggle-switch';

describe('ToggleSwitch atom (perapera-scenes.jsx Toggle 移植)', () => {
  it('renders with role=switch and aria-checked reflecting on prop', () => {
    render(<ToggleSwitch on={true} onChange={() => {}} />);
    const sw = screen.getByRole('switch');
    expect(sw.getAttribute('aria-checked')).toBe('true');
  });

  it('aria-checked=false when off', () => {
    render(<ToggleSwitch on={false} onChange={() => {}} />);
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false');
  });

  it('toggles via onChange when clicked', async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();
    render(<ToggleSwitch on={false} onChange={handleChange} />);
    await user.click(screen.getByRole('switch'));
    expect(handleChange).toHaveBeenCalledWith(true);
  });

  it('exposes data-on for stylesheet hooks', () => {
    render(<ToggleSwitch on={true} onChange={() => {}} />);
    expect(screen.getByRole('switch').getAttribute('data-on')).toBe('true');
  });

  it('respects disabled prop', () => {
    render(<ToggleSwitch on={false} onChange={() => {}} disabled />);
    expect(screen.getByRole('switch')).toBeDisabled();
  });
});
