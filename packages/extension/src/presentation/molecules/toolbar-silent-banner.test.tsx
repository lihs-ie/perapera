import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ToolbarSilentBanner } from './toolbar-silent-banner';

describe('ToolbarSilentBanner molecule (perapera-toolbar.jsx silent banner 移植)', () => {
  it('renders default Japanese message in status role', () => {
    render(<ToolbarSilentBanner />);
    expect(screen.getByRole('status')).toHaveTextContent('音声を検出できません');
  });

  it('respects custom message override', () => {
    render(<ToolbarSilentBanner message="マイクが見つかりません" />);
    expect(screen.getByRole('status')).toHaveTextContent('マイクが見つかりません');
  });
});
