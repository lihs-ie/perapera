import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SidePanelTemplate } from './side-panel-template';

describe('SidePanelTemplate (IMPL-552)', () => {
  it('renders header title', () => {
    render(<SidePanelTemplate listSlot={<div>list</div>} />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'perapera セッション' }),
    ).toBeInTheDocument();
  });

  it('renders version when provided', () => {
    render(<SidePanelTemplate listSlot={<div>list</div>} version="0.1.0" />);
    expect(screen.getByText('v0.1.0')).toBeInTheDocument();
  });

  it('renders listSlot content', () => {
    render(<SidePanelTemplate listSlot={<div>LIST-HERE</div>} />);
    expect(screen.getByText('LIST-HERE')).toBeInTheDocument();
  });

  it('exposes a section landmark for the list', () => {
    render(<SidePanelTemplate listSlot={<div>list</div>} />);
    expect(screen.getByRole('region', { name: '稼働中のセッション詳細' })).toBeInTheDocument();
  });
});
