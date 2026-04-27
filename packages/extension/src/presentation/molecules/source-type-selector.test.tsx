import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SourceTypeSelector } from './source-type-selector';

describe('SourceTypeSelector molecule (IMPL-530)', () => {
  it('renders all three source types as radios', () => {
    render(<SourceTypeSelector value="tab" onChange={vi.fn()} />);
    expect(screen.getByRole('radio', { name: 'タブ' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'マイク' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'デスクトップ' })).toBeInTheDocument();
  });

  it('marks the selected value as checked', () => {
    render(<SourceTypeSelector value="microphone" onChange={vi.fn()} />);
    expect(screen.getByRole('radio', { name: 'マイク' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'タブ' })).not.toBeChecked();
  });

  it('calls onChange with new sourceType on selection', async () => {
    const onChange = vi.fn();
    render(<SourceTypeSelector value="tab" onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: 'デスクトップ' }));
    expect(onChange).toHaveBeenCalledWith('desktop');
  });

  it('disables all radios when disabled', () => {
    render(<SourceTypeSelector value="tab" onChange={vi.fn()} disabled />);
    expect(screen.getByRole('radio', { name: 'タブ' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'マイク' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'デスクトップ' })).toBeDisabled();
  });
});
