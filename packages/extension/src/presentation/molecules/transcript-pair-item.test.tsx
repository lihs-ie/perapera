import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TranscriptPairItem } from './transcript-pair-item';

describe('TranscriptPairItem molecule (perapera-transcript.jsx TranscriptItem 移植)', () => {
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
    expect(screen.queryByText((_, el) => el?.getAttribute('data-part') === 'original')).toBeNull();
  });

  it('omits translation paragraph when translatedText is null', () => {
    render(<TranscriptPairItem originalText="plain" translatedText={null} isFinal={true} />);
    expect(screen.getByText('plain')).toBeInTheDocument();
    expect(
      screen.queryByText((_, el) => el?.getAttribute('data-part') === 'translation'),
    ).toBeNull();
  });

  it('shows only the speaker label when both texts are empty (final)', () => {
    render(<TranscriptPairItem originalText="" translatedText="" isFinal={true} />);
    const item = screen.getByRole('listitem');
    expect(item.textContent?.trim()).toBe('OTHER');
  });

  it('marks partial segments at root with data-partial=true and renders a cursor', () => {
    const { container } = render(
      <TranscriptPairItem originalText="partial" translatedText="部分" isFinal={false} />,
    );
    expect(screen.getByRole('listitem').getAttribute('data-partial')).toBe('true');
    expect(
      screen.getByText((_, el) => el?.getAttribute('data-part') === 'listening'),
    ).toHaveTextContent('LISTENING…');
    expect(container.querySelector('[data-component="cursor-blink"]')).not.toBeNull();
  });

  it('marks final segments with data-partial=false and no LISTENING badge', () => {
    render(<TranscriptPairItem originalText="done" translatedText="完了" isFinal={true} />);
    expect(screen.getByRole('listitem').getAttribute('data-partial')).toBe('false');
    expect(screen.queryByText('LISTENING…')).toBeNull();
  });

  it('omits header (speaker / time / CTX) when connectedToPrevious=true', () => {
    render(
      <TranscriptPairItem
        originalText="continuation"
        translatedText="続き"
        isFinal={true}
        connectedToPrevious={true}
        time="12:01:27"
      />,
    );
    expect(screen.queryByText('OTHER')).toBeNull();
    expect(screen.queryByText('12:01:27')).toBeNull();
  });

  it('shows ·CTX badge when hasTranslationContext=true', () => {
    render(
      <TranscriptPairItem
        originalText="x"
        translatedText="y"
        isFinal={true}
        hasTranslationContext={true}
      />,
    );
    expect(screen.getByText('·CTX')).toBeInTheDocument();
  });

  it('reflects age via data-age attribute', () => {
    render(<TranscriptPairItem originalText="x" translatedText="y" isFinal={true} age="old" />);
    expect(screen.getByRole('listitem').getAttribute('data-age')).toBe('old');
  });

  it('renders bookmark toggle when onToggleBookmark is provided on a final segment', () => {
    render(
      <TranscriptPairItem
        originalText="x"
        translatedText="y"
        isFinal={true}
        isBookmarked={false}
        onToggleBookmark={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'ブックマークに追加' })).toBeInTheDocument();
  });
});
