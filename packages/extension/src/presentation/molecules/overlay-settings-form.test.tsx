import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OverlaySettingsForm, type OverlaySettingsFormValues } from './overlay-settings-form';

const defaultValues: OverlaySettingsFormValues = {
  opacity: 0.8,
  maxLines: 2,
  fontScale: 1,
  showOriginalText: true,
  showTranslatedText: true,
};

describe('OverlaySettingsForm molecule', () => {
  it('renders all fields with current values', () => {
    render(<OverlaySettingsForm values={defaultValues} onChange={() => undefined} />);
    expect(screen.getByLabelText(/透明度/)).toHaveValue('0.8');
    expect(screen.getByLabelText(/最大行数/)).toHaveValue(2);
    expect(screen.getByLabelText(/フォント倍率/)).toHaveValue('1');
    expect(screen.getByRole('checkbox', { name: '原文を表示する' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '翻訳を表示する' })).toBeChecked();
  });

  it('emits opacity change clamped within [0,1]', () => {
    const onChange = vi.fn();
    render(<OverlaySettingsForm values={defaultValues} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/透明度/), { target: { value: '0.5' } });
    expect(onChange).toHaveBeenCalledWith({ ...defaultValues, opacity: 0.5 });
  });

  it('emits maxLines change as integer within [1,10]', () => {
    const onChange = vi.fn();
    render(<OverlaySettingsForm values={defaultValues} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/最大行数/), { target: { value: '5' } });
    expect(onChange).toHaveBeenCalledWith({ ...defaultValues, maxLines: 5 });
  });

  it('clamps maxLines above 10 to 10', () => {
    const onChange = vi.fn();
    render(<OverlaySettingsForm values={defaultValues} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/最大行数/), { target: { value: '99' } });
    expect(onChange).toHaveBeenCalledWith({ ...defaultValues, maxLines: 10 });
  });

  it('emits fontScale change within [0.75, 2]', () => {
    const onChange = vi.fn();
    render(<OverlaySettingsForm values={defaultValues} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/フォント倍率/), { target: { value: '1.5' } });
    expect(onChange).toHaveBeenCalledWith({ ...defaultValues, fontScale: 1.5 });
  });

  it('toggles showOriginalText via checkbox', () => {
    const onChange = vi.fn();
    render(<OverlaySettingsForm values={defaultValues} onChange={onChange} />);
    fireEvent.click(screen.getByRole('checkbox', { name: '原文を表示する' }));
    expect(onChange).toHaveBeenCalledWith({ ...defaultValues, showOriginalText: false });
  });

  it('prevents turning off showOriginalText when showTranslatedText is already off', () => {
    const onChange = vi.fn();
    render(
      <OverlaySettingsForm
        values={{ ...defaultValues, showTranslatedText: false }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: '原文を表示する' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('prevents turning off showTranslatedText when showOriginalText is already off', () => {
    const onChange = vi.fn();
    render(
      <OverlaySettingsForm
        values={{ ...defaultValues, showOriginalText: false }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: '翻訳を表示する' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('disables all fields when disabled=true', () => {
    render(
      <OverlaySettingsForm values={defaultValues} onChange={() => undefined} disabled={true} />,
    );
    expect(screen.getByLabelText(/透明度/)).toBeDisabled();
    expect(screen.getByLabelText(/最大行数/)).toBeDisabled();
    expect(screen.getByLabelText(/フォント倍率/)).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: '原文を表示する' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: '翻訳を表示する' })).toBeDisabled();
  });
});
