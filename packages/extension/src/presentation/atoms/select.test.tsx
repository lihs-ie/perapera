import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Select } from './select';

const OPTIONS = [
  { value: 'en-US', label: '英語 (米国)' },
  { value: 'ja-JP', label: '日本語' },
  { value: 'ko-KR', label: '韓国語' },
] as const;

describe('Select atom (IMPL-521)', () => {
  it('renders all options with labels', () => {
    render(<Select value="en-US" options={OPTIONS} onChange={vi.fn()} ariaLabel="language" />);
    expect(screen.getByRole('option', { name: '英語 (米国)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '日本語' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '韓国語' })).toBeInTheDocument();
  });

  it('selects the value prop initially', () => {
    render(<Select value="ja-JP" options={OPTIONS} onChange={vi.fn()} ariaLabel="lang" />);
    const combobox = screen.getByRole('combobox', { name: 'lang' });
    expect(combobox).toHaveValue('ja-JP');
  });

  it('calls onChange with selected value', async () => {
    const onChange = vi.fn();
    render(<Select value="en-US" options={OPTIONS} onChange={onChange} ariaLabel="lang" />);
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'lang' }),
      screen.getByRole('option', { name: '日本語' }),
    );
    expect(onChange).toHaveBeenCalledWith('ja-JP');
  });

  it('disables interaction when disabled', () => {
    render(<Select value="en-US" options={OPTIONS} onChange={vi.fn()} disabled ariaLabel="lang" />);
    expect(screen.getByRole('combobox', { name: 'lang' })).toBeDisabled();
  });
});
