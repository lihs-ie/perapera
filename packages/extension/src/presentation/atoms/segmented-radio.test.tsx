import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SegmentedRadio } from './segmented-radio';

const OPTIONS = [
  { value: 'top', label: '上' },
  { value: 'bottom', label: '下' },
  { value: 'left', label: '左上' },
  { value: 'right', label: '右上' },
];

describe('SegmentedRadio atom (perapera-scenes.jsx SegRadio 移植)', () => {
  it('renders one radio per option with aria-checked reflecting active', () => {
    render(
      <SegmentedRadio options={OPTIONS} value="bottom" onChange={() => {}} ariaLabel="位置" />,
    );
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(4);
    expect(radios[1]?.getAttribute('aria-checked')).toBe('true');
    expect(radios[0]?.getAttribute('aria-checked')).toBe('false');
  });

  it('exposes data-active=true on the active option only', () => {
    render(<SegmentedRadio options={OPTIONS} value="left" onChange={() => {}} ariaLabel="位置" />);
    const radios = screen.getAllByRole('radio');
    const actives = radios.map((r) => r.getAttribute('data-active'));
    expect(actives).toEqual(['false', 'false', 'true', 'false']);
  });

  it('fires onChange with selected value', async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();
    render(
      <SegmentedRadio options={OPTIONS} value="top" onChange={handleChange} ariaLabel="位置" />,
    );
    await user.click(screen.getByRole('radio', { name: '右上' }));
    expect(handleChange).toHaveBeenCalledWith('right');
  });

  it('respects disabled prop on every radio', () => {
    render(
      <SegmentedRadio
        options={OPTIONS}
        value="top"
        onChange={() => {}}
        ariaLabel="位置"
        disabled
      />,
    );
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).toBeDisabled();
    }
  });
});
