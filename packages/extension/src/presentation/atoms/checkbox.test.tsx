import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Checkbox } from './checkbox';

describe('Checkbox atom (IMPL-523)', () => {
  it('renders with initial checked state', () => {
    render(<Checkbox checked={true} onChange={vi.fn()} ariaLabel="auto-detect" />);
    expect(screen.getByRole('checkbox', { name: 'auto-detect' })).toBeChecked();
  });

  it('calls onChange with new checked value on click', async () => {
    const onChange = vi.fn();
    render(<Checkbox checked={false} onChange={onChange} ariaLabel="auto-detect" />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'auto-detect' }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('disables interaction when disabled', async () => {
    const onChange = vi.fn();
    render(<Checkbox checked={false} onChange={onChange} disabled ariaLabel="x" />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'x' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
