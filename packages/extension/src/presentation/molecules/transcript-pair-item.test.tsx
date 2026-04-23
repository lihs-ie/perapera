import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TranscriptPairItem } from './transcript-pair-item';

describe('TranscriptPairItem molecule', () => {
  it('renders original and translation with default OTHER label', () => {
    render(<TranscriptPairItem originalText="Hello" translatedText="こんにちは" isFinal={true} />);
    expect(screen.getByText('OTHER')).toBeInTheDocument();
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('こんにちは')).toBeInTheDocument();
  });

  it('uses custom speakerLabel when provided', () => {
    render(
      <TranscriptPairItem
        originalText="Hi"
        translatedText="やあ"
        isFinal={true}
        speakerLabel="HOST"
      />,
    );
    expect(screen.getByText('HOST')).toBeInTheDocument();
    expect(screen.queryByText('OTHER')).toBeNull();
  });

  it('omits original paragraph when originalText is null', () => {
    render(<TranscriptPairItem originalText={null} translatedText="only" isFinal={true} />);
    expect(screen.getByText('only')).toBeInTheDocument();
    expect(screen.queryByText('OTHER', { selector: '.original' })).toBeNull();
  });

  it('omits translation paragraph when translatedText is null', () => {
    render(<TranscriptPairItem originalText="plain" translatedText={null} isFinal={true} />);
    expect(screen.getByText('plain')).toBeInTheDocument();
  });

  it('omits empty strings entirely', () => {
    render(<TranscriptPairItem originalText="" translatedText="" isFinal={true} />);
    const item = screen.getByRole('listitem');
    expect(item.textContent).toBe('OTHER');
  });

  it('marks partial segments with data-partial=true', () => {
    render(<TranscriptPairItem originalText="partial" translatedText="部分" isFinal={false} />);
    const original = screen.getByText('partial');
    expect(original.getAttribute('data-partial')).toBe('true');
    const translation = screen.getByText('部分');
    expect(translation.getAttribute('data-partial')).toBe('true');
  });

  it('marks final segments with data-partial=false', () => {
    render(<TranscriptPairItem originalText="done" translatedText="完了" isFinal={true} />);
    const original = screen.getByText('done');
    expect(original.getAttribute('data-partial')).toBe('false');
  });
});
