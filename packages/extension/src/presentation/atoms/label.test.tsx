import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Label } from './label';

describe('Label atom (IMPL-524)', () => {
  it('renders children as label text', () => {
    render(<Label>ソース種別</Label>);
    expect(screen.getByText('ソース種別')).toBeInTheDocument();
  });

  it('binds to an input via htmlFor', () => {
    render(<Label htmlFor="source-type">ソース種別</Label>);
    const label = screen.getByText('ソース種別');
    expect(label).toHaveAttribute('for', 'source-type');
  });
});
