import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SourceRow } from './source-row';

describe('SourceRow molecule (perapera-scenes.jsx PopupScene SourceRow 移植)', () => {
  it('renders name, language pair, and StatusPill', () => {
    render(<SourceRow name="YouTube Live" pair="EN→JA" state="capturing" mode="live" />);
    expect(screen.getByText('YouTube Live')).toBeInTheDocument();
    expect(screen.getByText('EN→JA')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('CAPTURING');
  });

  it('embeds a MiniWaveform with the given mode', () => {
    const { container } = render(
      <SourceRow name="x" pair="EN→JA" state="degraded" mode="degraded" />,
    );
    const waveform = container.querySelector('[data-component="waveform"]') as HTMLElement;
    expect(waveform.dataset.mode).toBe('degraded');
  });

  it('exposes single-word data-component name on root', () => {
    const { container } = render(<SourceRow name="x" pair="EN→JA" state="idle" mode="idle" />);
    expect((container.firstChild as HTMLElement).dataset.component).toBe('source-row');
  });
});
