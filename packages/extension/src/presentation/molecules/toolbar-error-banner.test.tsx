import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToolbarErrorBanner } from './toolbar-error-banner';

describe('ToolbarErrorBanner molecule (perapera-toolbar.jsx banner 移植)', () => {
  it('renders message in alert role with error variant', () => {
    render(<ToolbarErrorBanner variant="error" message="接続が失われました" />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('接続が失われました');
    expect(alert.dataset.variant).toBe('error');
  });

  it('uses warn variant for non-fatal warnings', () => {
    render(<ToolbarErrorBanner variant="warn" message="文字起こしのみ" />);
    expect(screen.getByRole('alert').dataset.variant).toBe('warn');
  });

  it('renders action button and fires its onClick', async () => {
    const handleAction = vi.fn();
    const user = userEvent.setup();
    render(
      <ToolbarErrorBanner
        variant="error"
        message="x"
        action={{ label: '再接続', onClick: handleAction }}
      />,
    );
    await user.click(screen.getByRole('button', { name: '再接続' }));
    expect(handleAction).toHaveBeenCalledOnce();
  });

  it('omits action button when no action provided', () => {
    render(<ToolbarErrorBanner variant="error" message="x" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
