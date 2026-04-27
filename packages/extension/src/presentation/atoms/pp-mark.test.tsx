import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PPMark } from './pp-mark';

describe('PPMark atom (perapera-ui.jsx PPMark 移植)', () => {
  it('renders an svg with default size 18', () => {
    const { container } = render(<PPMark />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('width')).toBe('18');
    expect(svg?.getAttribute('height')).toBe('18');
  });

  it('respects custom size prop', () => {
    const { container } = render(<PPMark size={11} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('11');
  });

  it('renders 2 rect + 1 path (mark structure)', () => {
    const { container } = render(<PPMark />);
    expect(container.querySelectorAll('rect')).toHaveLength(2);
    expect(container.querySelectorAll('path')).toHaveLength(1);
  });

  it('uses currentColor so parent CSS color controls fill', () => {
    const { container } = render(<PPMark />);
    const filled = container.querySelectorAll('[fill="currentColor"]');
    expect(filled.length).toBeGreaterThan(0);
  });

  it('is decorative (aria-hidden)', () => {
    const { container } = render(<PPMark />);
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});
