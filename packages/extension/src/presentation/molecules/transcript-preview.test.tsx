import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TranscriptPreview, type TranscriptPreviewLine } from './transcript-preview';

const buildLine = (overrides: Partial<TranscriptPreviewLine>): TranscriptPreviewLine => ({
  sessionId: 's-1',
  segmentId: `seg-${String(Math.random()).slice(2, 8)}`,
  ...overrides,
});

describe('TranscriptPreview molecule (IMPL-534)', () => {
  it('renders empty message when no segments for session', () => {
    render(<TranscriptPreview sessionId="s-1" segments={[]} />);
    expect(screen.getByText('字幕はまだありません。')).toBeInTheDocument();
  });

  it('filters segments by sessionId', () => {
    render(
      <TranscriptPreview
        sessionId="s-1"
        segments={[
          buildLine({ sessionId: 's-1', segmentId: 'a', originalText: 'hello' }),
          buildLine({ sessionId: 's-2', segmentId: 'b', originalText: 'world' }),
        ]}
      />,
    );
    expect(screen.getByText('hello')).toBeInTheDocument();
    expect(screen.queryByText('world')).toBeNull();
  });

  it('renders both original and translated lines', () => {
    render(
      <TranscriptPreview
        sessionId="s-1"
        segments={[
          buildLine({
            segmentId: 'seg-1',
            originalText: 'Hello',
            translatedText: 'こんにちは',
          }),
        ]}
      />,
    );
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('こんにちは')).toBeInTheDocument();
  });

  it('omits missing fields (no original)', () => {
    render(
      <TranscriptPreview
        sessionId="s-1"
        segments={[buildLine({ segmentId: 's', translatedText: 'only translation' })]}
      />,
    );
    expect(screen.getByText('only translation')).toBeInTheDocument();
  });

  it('respects limit prop (most recent N items)', () => {
    const segments = Array.from({ length: 5 }, (_, index) =>
      buildLine({ segmentId: `seg-${index}`, originalText: `line${index}` }),
    );
    render(<TranscriptPreview sessionId="s-1" segments={segments} limit={2} />);
    expect(screen.queryByText('line0')).toBeNull();
    expect(screen.queryByText('line2')).toBeNull();
    expect(screen.getByText('line3')).toBeInTheDocument();
    expect(screen.getByText('line4')).toBeInTheDocument();
  });
});
