import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  ArrowIcon,
  BookmarkIcon,
  CheckIcon,
  ChevronDownIcon,
  CloseIcon,
  CopyIcon,
  ExportIcon,
  GlobeIcon,
  PauseIcon,
  RetryIcon,
  SettingsIcon,
  SourceIcon,
  WarningTriangleIcon,
} from './index';

describe('icon atoms (PP design system)', () => {
  it('all primitive icons render an <svg> root', () => {
    const Icons = [
      ArrowIcon,
      BookmarkIcon,
      CheckIcon,
      ChevronDownIcon,
      CloseIcon,
      CopyIcon,
      ExportIcon,
      GlobeIcon,
      PauseIcon,
      RetryIcon,
      SettingsIcon,
      WarningTriangleIcon,
    ] as const;
    for (const Icon of Icons) {
      const { container, unmount } = render(<Icon />);
      expect(container.querySelector('svg')).not.toBeNull();
      unmount();
    }
  });

  it('SourceIcon renders distinct paths per kind', () => {
    const tab = render(<SourceIcon kind="tab" />);
    const mic = render(<SourceIcon kind="microphone" />);
    const desktop = render(<SourceIcon kind="desktop" />);
    expect(tab.container.innerHTML).not.toBe(mic.container.innerHTML);
    expect(mic.container.innerHTML).not.toBe(desktop.container.innerHTML);
    tab.unmount();
    mic.unmount();
    desktop.unmount();
  });

  it('size prop controls width and height', () => {
    const { container } = render(<ArrowIcon size={20} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('20');
    expect(svg?.getAttribute('height')).toBe('20');
  });

  it('uses currentColor so parent CSS controls icon color', () => {
    const { container } = render(<ArrowIcon />);
    const stroked = container.querySelector('[stroke="currentColor"]');
    expect(stroked).not.toBeNull();
  });

  it('icons are decorative (aria-hidden)', () => {
    const { container } = render(<SettingsIcon />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });
});
