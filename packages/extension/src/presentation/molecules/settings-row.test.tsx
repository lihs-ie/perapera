import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SettingsRow } from './settings-row';

describe('SettingsRow molecule (perapera-scenes.jsx SettingsScene Row 移植)', () => {
  it('renders label and control children', () => {
    render(
      <SettingsRow label="入力言語">
        <select aria-label="x">
          <option>EN-US</option>
        </select>
      </SettingsRow>,
    );
    expect(screen.getByText('入力言語')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'x' })).toBeInTheDocument();
  });

  it('shows hint when provided', () => {
    render(
      <SettingsRow label="無音判定" hint="息継ぎで途切れる場合は長めに">
        <input aria-label="x" />
      </SettingsRow>,
    );
    expect(screen.getByText('息継ぎで途切れる場合は長めに')).toBeInTheDocument();
  });

  it('omits hint when not provided', () => {
    const { container } = render(
      <SettingsRow label="x">
        <span>y</span>
      </SettingsRow>,
    );
    expect(container.querySelector('[data-part="hint"]')).toBeNull();
  });
});
