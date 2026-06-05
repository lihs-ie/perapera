import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LanguagePairDisplay } from './language-pair-display';

describe('LanguagePairDisplay molecule (perapera-toolbar.jsx 言語ペア表示 移植)', () => {
  it('renders source and target separated by an arrow icon', () => {
    const { container } = render(<LanguagePairDisplay source="EN-US" target="JA-JP" />);
    expect(screen.getByText('EN-US')).toBeInTheDocument();
    expect(screen.getByText('JA-JP')).toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('size=md is the default', () => {
    const { container } = render(<LanguagePairDisplay source="EN" target="JA" />);
    expect((container.firstChild as HTMLElement).dataset.size).toBe('md');
  });

  it('size=sm exposes data-size=sm for popup contexts', () => {
    const { container } = render(<LanguagePairDisplay source="EN" target="JA" size="sm" />);
    expect((container.firstChild as HTMLElement).dataset.size).toBe('sm');
  });
});
