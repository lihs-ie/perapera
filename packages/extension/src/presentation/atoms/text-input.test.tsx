import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TextInput } from './text-input';

describe('TextInput atom (IMPL-522)', () => {
  it('renders with placeholder', () => {
    render(<TextInput value="" onChange={vi.fn()} placeholder="名前" ariaLabel="name" />);
    expect(screen.getByPlaceholderText('名前')).toBeInTheDocument();
  });

  it('reflects the current value', () => {
    render(<TextInput value="hello" onChange={vi.fn()} ariaLabel="name" />);
    expect(screen.getByRole('textbox', { name: 'name' })).toHaveValue('hello');
  });

  it('calls onChange on typing', async () => {
    const onChange = vi.fn();
    render(<TextInput value="" onChange={onChange} ariaLabel="name" />);
    await userEvent.type(screen.getByRole('textbox', { name: 'name' }), 'a');
    expect(onChange).toHaveBeenCalledWith('a');
  });

  it('disables interaction when disabled', () => {
    render(<TextInput value="" onChange={vi.fn()} disabled ariaLabel="name" />);
    expect(screen.getByRole('textbox', { name: 'name' })).toBeDisabled();
  });
});
