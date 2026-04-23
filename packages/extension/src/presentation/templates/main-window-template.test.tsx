import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MainWindowTemplate } from './main-window-template';

describe('MainWindowTemplate', () => {
  it('renders form slot when isActive is false', () => {
    render(
      <MainWindowTemplate
        isActive={false}
        formSlot={<div>form-body</div>}
        toolbarSlot={<div>toolbar</div>}
        streamSlot={<div>stream-body</div>}
      />,
    );
    expect(screen.getByText('form-body')).toBeInTheDocument();
    expect(screen.queryByText('toolbar')).toBeNull();
    expect(screen.queryByText('stream-body')).toBeNull();
  });

  it('renders toolbar and stream slots when isActive is true', () => {
    render(
      <MainWindowTemplate
        isActive={true}
        formSlot={<div>form-body</div>}
        toolbarSlot={<div>toolbar</div>}
        streamSlot={<div>stream-body</div>}
      />,
    );
    expect(screen.getByText('toolbar')).toBeInTheDocument();
    expect(screen.getByText('stream-body')).toBeInTheDocument();
    expect(screen.queryByText('form-body')).toBeNull();
  });

  it('shows app title in idle state', () => {
    render(
      <MainWindowTemplate
        isActive={false}
        formSlot={<div />}
        toolbarSlot={<div />}
        streamSlot={<div />}
      />,
    );
    expect(screen.getByRole('heading', { name: 'perapera' })).toBeInTheDocument();
  });

  it('uses container as root className', () => {
    const { container } = render(
      <MainWindowTemplate
        isActive={false}
        formSlot={<div />}
        toolbarSlot={<div />}
        streamSlot={<div />}
      />,
    );
    expect(container.firstElementChild?.className).toBe('container');
  });
});
