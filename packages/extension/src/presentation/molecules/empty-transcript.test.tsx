import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptyTranscript } from './empty-transcript';

describe('EmptyTranscript molecule (perapera-transcript.jsx EmptyTranscript 移植)', () => {
  it('renders default Japanese message and PPMark', () => {
    const { container } = render(<EmptyTranscript />);
    expect(screen.getByText(/セッションを開始すると/)).toBeInTheDocument();
    expect(container.querySelector('[data-component="pp-mark"]')).not.toBeNull();
  });

  it('respects custom message override', () => {
    render(<EmptyTranscript message="ソースを追加してください" />);
    expect(screen.getByText('ソースを追加してください')).toBeInTheDocument();
  });

  it('wraps PPMark in a circular accent frame (data-part)', () => {
    const { container } = render(<EmptyTranscript />);
    expect(container.querySelector('[data-part="mark-frame"]')).not.toBeNull();
  });
});
