import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { SettingsSection } from './settings-section';

describe('SettingsSection molecule (perapera-scenes.jsx SettingsScene Section 移植)', () => {
  it('renders title and children', () => {
    render(
      <SettingsSection title="言語">
        <p>row</p>
      </SettingsSection>,
    );
    expect(screen.getByText('言語')).toBeInTheDocument();
    expect(screen.getByText('row')).toBeInTheDocument();
  });

  it('non-collapsible section is always open', () => {
    const { container } = render(
      <SettingsSection title="x">
        <p>row</p>
      </SettingsSection>,
    );
    expect((container.firstChild as HTMLElement).dataset.open).toBe('true');
  });

  it('collapsible section opens by default and toggles via header click', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <SettingsSection title="詳細" collapsible>
        <p>row</p>
      </SettingsSection>,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.dataset.open).toBe('true');
    expect(screen.getByText('row')).toBeInTheDocument();
    await user.click(screen.getByText('詳細'));
    expect(root.dataset.open).toBe('false');
    expect(screen.queryByText('row')).toBeNull();
  });

  it('collapsible defaultOpen=false hides children initially', () => {
    render(
      <SettingsSection title="詳細" collapsible defaultOpen={false}>
        <p>row</p>
      </SettingsSection>,
    );
    expect(screen.queryByText('row')).toBeNull();
  });
});
