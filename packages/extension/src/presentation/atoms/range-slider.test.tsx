import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RangeSlider } from './range-slider';

describe('RangeSlider atom (perapera-scenes.jsx Slider 移植)', () => {
  it('renders an input[type=range] with min/max/step', () => {
    render(
      <RangeSlider
        value={0.5}
        min={0}
        max={1}
        step={0.05}
        onChange={() => {}}
        ariaLabel="不透明度"
      />,
    );
    const input = screen.getByRole('slider', { name: '不透明度' });
    expect(input).toHaveAttribute('min', '0');
    expect(input).toHaveAttribute('max', '1');
    expect(input).toHaveAttribute('step', '0.05');
    expect(input).toHaveValue('0.5');
  });

  it('forwards numeric value to onChange', () => {
    const handleChange = vi.fn();
    render(<RangeSlider value={0.5} onChange={handleChange} ariaLabel="x" />);
    const input = screen.getByRole('slider', { name: 'x' });
    fireEvent.change(input, { target: { value: '0.8' } });
    expect(handleChange).toHaveBeenCalledWith(0.8);
  });

  it('renders marks array as numeric labels', () => {
    render(
      <RangeSlider
        value={0.5}
        onChange={() => {}}
        ariaLabel="x"
        marks={['200ms', '600ms', '1200ms']}
      />,
    );
    expect(screen.getByText('200ms')).toBeInTheDocument();
    expect(screen.getByText('1200ms')).toBeInTheDocument();
  });

  it('omits marks block when not provided', () => {
    const { container } = render(<RangeSlider value={0.5} onChange={() => {}} ariaLabel="x" />);
    expect(container.querySelectorAll('span').length).toBe(0);
  });
});
