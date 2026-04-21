import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SessionListItem, type SessionViewModel } from './session-list-item';

const session: SessionViewModel = {
  sessionId: '01HZX8Y1R8M7D3Q2P4T5V6W7A1',
  displayName: 'YouTube Live',
  state: 'capturing',
  sourceType: 'tab',
};

describe('SessionListItem molecule (IMPL-532)', () => {
  it('renders displayName, sourceType, and state badge', () => {
    render(<SessionListItem session={session} onStop={vi.fn()} />);
    expect(screen.getByText('YouTube Live')).toBeInTheDocument();
    expect(screen.getByText('[tab]')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAttribute('data-variant', 'active');
  });

  it('calls onStop with sessionId when Stop is clicked', async () => {
    const onStop = vi.fn();
    render(<SessionListItem session={session} onStop={onStop} />);
    await userEvent.click(screen.getByRole('button', { name: 'YouTube Live を停止' }));
    expect(onStop).toHaveBeenCalledWith('01HZX8Y1R8M7D3Q2P4T5V6W7A1');
  });

  it('disables the Stop button when disabled', () => {
    render(<SessionListItem session={session} onStop={vi.fn()} disabled />);
    expect(screen.getByRole('button', { name: 'YouTube Live を停止' })).toBeDisabled();
  });
});
