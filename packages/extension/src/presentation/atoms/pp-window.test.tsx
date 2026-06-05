import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PPWindow } from './pp-window';

describe('PPWindow atom (perapera-ui.jsx PPWindow 移植)', () => {
  it('renders with default title "perapera"', () => {
    render(
      <PPWindow>
        <div>body</div>
      </PPWindow>,
    );
    expect(screen.getByText('perapera')).toBeInTheDocument();
  });

  it('shows custom title and subtitle separated by ·', () => {
    render(
      <PPWindow title="settings" subtitle="popup">
        <div>body</div>
      </PPWindow>,
    );
    expect(screen.getByText('settings')).toBeInTheDocument();
    expect(screen.getByText('· popup')).toBeInTheDocument();
  });

  it('omits subtitle when not provided', () => {
    render(
      <PPWindow>
        <div>body</div>
      </PPWindow>,
    );
    expect(screen.queryByText(/·/)).toBeNull();
  });

  it('renders 3 traffic light dots (decorative) with mac colors', () => {
    const { container } = render(
      <PPWindow>
        <div>body</div>
      </PPWindow>,
    );
    const root = container.firstChild as HTMLElement;
    const lights = root.querySelectorAll('[aria-hidden="true"] > span');
    expect(lights.length).toBeGreaterThanOrEqual(3);
    const colors = Array.from(lights)
      .slice(0, 3)
      .map((el) => (el as HTMLElement).style.background);
    expect(colors).toEqual(['rgb(255, 95, 87)', 'rgb(254, 188, 46)', 'rgb(40, 200, 64)']);
  });

  it('renders children inside body slot', () => {
    render(
      <PPWindow>
        <div data-testid="child">hello</div>
      </PPWindow>,
    );
    expect(screen.getByTestId('child')).toHaveTextContent('hello');
  });

  it('uses single-word className "container" on root and respects width / height', () => {
    const { container } = render(
      <PPWindow width={340} height={420}>
        <div>body</div>
      </PPWindow>,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).toBe('container');
    expect(root.style.width).toBe('340px');
    expect(root.style.height).toBe('420px');
  });
});
