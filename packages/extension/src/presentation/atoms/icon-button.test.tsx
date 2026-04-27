import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { IconButton } from './icon-button';

describe('IconButton atom (perapera-ui.jsx IconBtn 移植)', () => {
  it('exposes label as aria-label and title', () => {
    render(
      <IconButton label="設定">
        <span>⚙</span>
      </IconButton>,
    );
    const btn = screen.getByRole('button', { name: '設定' });
    expect(btn).toHaveAttribute('title', '設定');
  });

  it('fires onClick when clicked', async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();
    render(
      <IconButton label="設定" onClick={handleClick}>
        <span>⚙</span>
      </IconButton>,
    );
    await user.click(screen.getByRole('button', { name: '設定' }));
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it('applies data-variant=danger when danger=true', () => {
    render(
      <IconButton label="停止" danger>
        <span>×</span>
      </IconButton>,
    );
    expect(screen.getByRole('button', { name: '停止' })).toHaveAttribute('data-variant', 'danger');
  });

  it('defaults to data-variant=default', () => {
    render(
      <IconButton label="設定">
        <span>⚙</span>
      </IconButton>,
    );
    expect(screen.getByRole('button', { name: '設定' })).toHaveAttribute('data-variant', 'default');
  });

  it('respects size prop on width / height inline style', () => {
    render(
      <IconButton label="設定" size={28}>
        <span>⚙</span>
      </IconButton>,
    );
    const btn = screen.getByRole('button', { name: '設定' });
    expect(btn.style.width).toBe('28px');
    expect(btn.style.height).toBe('28px');
  });

  it('respects disabled prop', () => {
    render(
      <IconButton label="設定" disabled>
        <span>⚙</span>
      </IconButton>,
    );
    expect(screen.getByRole('button', { name: '設定' })).toBeDisabled();
  });
});
