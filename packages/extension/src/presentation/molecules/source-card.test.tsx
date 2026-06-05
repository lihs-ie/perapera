import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SourceCard } from './source-card';

describe('SourceCard molecule (perapera-scenes.jsx SidePanelScene SourceCard 移植)', () => {
  it('renders name, language pair (a → b), and StatusPill', () => {
    render(
      <SourceCard name="YouTube Live" pair={['EN-US', 'JA-JP']} state="capturing" mode="live" />,
    );
    expect(screen.getByRole('heading', { name: 'YouTube Live' })).toBeInTheDocument();
    expect(screen.getByText('EN-US → JA-JP')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('CAPTURING');
  });

  it('shows original and translation when both provided', () => {
    render(
      <SourceCard
        name="x"
        pair={['EN-US', 'JA-JP']}
        state="capturing"
        mode="live"
        original="The hot path"
        translation="ホットパス"
      />,
    );
    expect(screen.getByText('The hot path')).toBeInTheDocument();
    expect(screen.getByText('ホットパス')).toBeInTheDocument();
  });

  it('omits content block when both original and translation are empty', () => {
    const { container } = render(
      <SourceCard name="x" pair={['EN-US', 'JA-JP']} state="capturing" mode="live" />,
    );
    expect(container.querySelector('[data-part="content"]')).toBeNull();
  });

  it('shows reason banner with retry button when onRetry provided', async () => {
    const handleRetry = vi.fn();
    const user = userEvent.setup();
    render(
      <SourceCard
        name="x"
        pair={['EN-US', 'JA-JP']}
        state="degraded"
        mode="degraded"
        reason="TRANSLATION_PROVIDER_TIMEOUT"
        onRetry={handleRetry}
      />,
    );
    expect(screen.getByText('TRANSLATION_PROVIDER_TIMEOUT')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '再試行' }));
    expect(handleRetry).toHaveBeenCalledOnce();
  });

  it('omits retry button when onRetry not provided', () => {
    render(
      <SourceCard name="x" pair={['EN-US', 'JA-JP']} state="degraded" mode="degraded" reason="X" />,
    );
    expect(screen.queryByRole('button', { name: '再試行' })).toBeNull();
  });
});
