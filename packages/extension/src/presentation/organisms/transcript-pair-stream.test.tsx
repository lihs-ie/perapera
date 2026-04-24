import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type OverlayLine } from '../../application/ports/overlay-presenter';
import {
  createSegmentIdentifier,
  type SegmentIdentifier,
} from '../../domain/transcript/segment-identifier';
import { TranscriptPairStream } from './transcript-pair-stream';

const buildLine = (overrides: Partial<OverlayLine> = {}): OverlayLine => ({
  segmentIdentifier: overrides.segmentIdentifier ?? createSegmentIdentifier(),
  originalText: overrides.originalText ?? 'hello',
  translatedText: overrides.translatedText ?? 'こんにちは',
  targetLanguage: overrides.targetLanguage ?? 'ja-JP',
  isFinal: overrides.isFinal ?? true,
  precedingSegmentIdentifier: overrides.precedingSegmentIdentifier ?? null,
  hasTranslationContext: overrides.hasTranslationContext ?? false,
});

describe('TranscriptPairStream organism', () => {
  beforeEach(() => {
    // jsdom does not implement scrollIntoView; stub so useEffect runs silently.
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('renders empty placeholder when no lines given', () => {
    render(<TranscriptPairStream lines={[]} />);
    expect(
      screen.getByText(/セッションを開始すると字幕と翻訳がここに表示されます/),
    ).toBeInTheDocument();
  });

  it('renders each provided line as a TranscriptPairItem', () => {
    const lines: OverlayLine[] = [
      buildLine({ originalText: 'first original', translatedText: 'first 翻訳' }),
      buildLine({ originalText: 'second original', translatedText: 'second 翻訳' }),
    ];
    render(<TranscriptPairStream lines={lines} />);
    expect(screen.getByText('first original')).toBeInTheDocument();
    expect(screen.getByText('first 翻訳')).toBeInTheDocument();
    expect(screen.getByText('second original')).toBeInTheDocument();
    expect(screen.getByText('second 翻訳')).toBeInTheDocument();
  });

  it('scrolls the bottom sentinel into view whenever lines count changes', () => {
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView');
    const initial: OverlayLine[] = [buildLine()];
    const { rerender } = render(<TranscriptPairStream lines={initial} />);
    const callCountAfterMount = spy.mock.calls.length;

    const extended: OverlayLine[] = [...initial, buildLine()];
    rerender(<TranscriptPairStream lines={extended} />);

    expect(spy.mock.calls.length).toBeGreaterThan(callCountAfterMount);
  });

  it('uses segmentIdentifier as stable key (same id does not duplicate)', () => {
    const id: SegmentIdentifier = createSegmentIdentifier();
    const lines: OverlayLine[] = [buildLine({ segmentIdentifier: id, translatedText: 'first' })];
    const { rerender } = render(<TranscriptPairStream lines={lines} />);
    expect(screen.getByText('first')).toBeInTheDocument();

    rerender(
      <TranscriptPairStream
        lines={[buildLine({ segmentIdentifier: id, translatedText: 'updated' })]}
      />,
    );
    expect(screen.getByText('updated')).toBeInTheDocument();
    expect(screen.queryByText('first')).toBeNull();
  });

  const setScrollMetrics = (
    el: Element,
    metrics: { scrollHeight: number; scrollTop: number; clientHeight: number },
  ): void => {
    Object.defineProperty(el, 'scrollHeight', {
      configurable: true,
      value: metrics.scrollHeight,
    });
    Object.defineProperty(el, 'scrollTop', {
      configurable: true,
      writable: true,
      value: metrics.scrollTop,
    });
    Object.defineProperty(el, 'clientHeight', {
      configurable: true,
      value: metrics.clientHeight,
    });
  };

  it('suppresses auto-scroll when user scrolls away from bottom', () => {
    const initial: OverlayLine[] = [buildLine()];
    const { rerender } = render(<TranscriptPairStream lines={initial} />);
    const container = screen.getByTestId('transcript-scroll-container');

    // ユーザーが遡った状態をシミュレート (最下部から 700px 離れている)
    setScrollMetrics(container, { scrollHeight: 1000, scrollTop: 100, clientHeight: 200 });
    fireEvent.scroll(container);

    const spy = vi.spyOn(Element.prototype, 'scrollIntoView');
    spy.mockClear();

    rerender(<TranscriptPairStream lines={[...initial, buildLine()]} />);
    expect(spy).not.toHaveBeenCalled();
  });

  it('re-enables auto-scroll when user scrolls back to bottom', () => {
    const initial: OverlayLine[] = [buildLine()];
    const { rerender } = render(<TranscriptPairStream lines={initial} />);
    const container = screen.getByTestId('transcript-scroll-container');

    setScrollMetrics(container, { scrollHeight: 1000, scrollTop: 100, clientHeight: 200 });
    fireEvent.scroll(container);

    // ユーザーが最下部付近に戻った (distance = 1000 - 790 - 200 = 10 <= threshold 40)
    setScrollMetrics(container, { scrollHeight: 1000, scrollTop: 790, clientHeight: 200 });
    fireEvent.scroll(container);

    const spy = vi.spyOn(Element.prototype, 'scrollIntoView');
    spy.mockClear();

    rerender(<TranscriptPairStream lines={[...initial, buildLine()]} />);
    expect(spy).toHaveBeenCalled();
  });

  it('treats scroll within the stick threshold as stick-to-bottom', () => {
    const initial: OverlayLine[] = [buildLine()];
    const { rerender } = render(<TranscriptPairStream lines={initial} />);
    const container = screen.getByTestId('transcript-scroll-container');

    // distance = 1000 - 770 - 200 = 30 (< threshold 40)
    setScrollMetrics(container, { scrollHeight: 1000, scrollTop: 770, clientHeight: 200 });
    fireEvent.scroll(container);

    const spy = vi.spyOn(Element.prototype, 'scrollIntoView');
    spy.mockClear();

    rerender(<TranscriptPairStream lines={[...initial, buildLine()]} />);
    expect(spy).toHaveBeenCalled();
  });
});
