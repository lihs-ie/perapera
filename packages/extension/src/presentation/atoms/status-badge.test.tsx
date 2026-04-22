import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBadge } from './status-badge';

describe('StatusBadge atom (IMPL-525)', () => {
  it('shows the raw state when no children provided', () => {
    render(<StatusBadge state="capturing" />);
    expect(screen.getByText('capturing')).toBeInTheDocument();
  });

  it('maps active states (capturing/transcribing/translating) to variant=active', () => {
    const { rerender } = render(<StatusBadge state="capturing" />);
    expect(screen.getByRole('status')).toHaveAttribute('data-variant', 'active');
    rerender(<StatusBadge state="transcribing" />);
    expect(screen.getByRole('status')).toHaveAttribute('data-variant', 'active');
    rerender(<StatusBadge state="translating" />);
    expect(screen.getByRole('status')).toHaveAttribute('data-variant', 'active');
  });

  it('maps pending states to variant=pending', () => {
    const { rerender } = render(<StatusBadge state="requesting_permission" />);
    expect(screen.getByRole('status')).toHaveAttribute('data-variant', 'pending');
    rerender(<StatusBadge state="connecting" />);
    expect(screen.getByRole('status')).toHaveAttribute('data-variant', 'pending');
    rerender(<StatusBadge state="reconnecting" />);
    expect(screen.getByRole('status')).toHaveAttribute('data-variant', 'pending');
  });

  it('maps degraded / error / stopped to their own variants', () => {
    const { rerender } = render(<StatusBadge state="degraded" />);
    expect(screen.getByRole('status')).toHaveAttribute('data-variant', 'degraded');
    rerender(<StatusBadge state="error" />);
    expect(screen.getByRole('status')).toHaveAttribute('data-variant', 'error');
    rerender(<StatusBadge state="stopped" />);
    expect(screen.getByRole('status')).toHaveAttribute('data-variant', 'stopped');
  });

  it('falls back to neutral variant for unknown states', () => {
    render(<StatusBadge state="zzz-unknown" />);
    expect(screen.getByRole('status')).toHaveAttribute('data-variant', 'neutral');
  });

  it('renders custom children over raw state', () => {
    render(<StatusBadge state="error">失敗</StatusBadge>);
    expect(screen.getByText('失敗')).toBeInTheDocument();
    expect(screen.queryByText('error')).toBeNull();
  });
});
