import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { type OverlayLine } from '../../application/ports/overlay-presenter';
import { useTranscriptAges } from '../hooks/use-transcript-age';
import { EmptyTranscript } from '../molecules/empty-transcript';
import { TranscriptPairItem } from '../molecules/transcript-pair-item';

export type Props = Readonly<{
  lines: readonly OverlayLine[];
}>;

const STICK_THRESHOLD_PX = 40;

/**
 * TranscriptPairStream organism (perapera-transcript.jsx TranscriptStream 移植)。
 *
 * 自身が scroll container を兼ね、上部 12px に mask gradient で fade を入れる。
 * 行の age (fresh/recent/old) を `useTranscriptAges` で派生して各 item に渡す。
 * 末尾要素は `isLatest=true` で render し、partial 時のフェードアップ animation を
 * 起動する (perapera-transcript.jsx の流麗さを再現)。
 *
 * Scroll 挙動:
 * - 初期 stick-to-bottom (常に最新行を表示)
 * - 上にスクロールすると auto-scroll を抑制
 * - 最下部 40px 以内に戻ると stick-to-bottom 復帰
 */
export function TranscriptPairStream(props: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [stickToBottom, setStickToBottom] = useState(true);
  const ages = useTranscriptAges(props.lines.length);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (el === null) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setStickToBottom(distanceFromBottom <= STICK_THRESHOLD_PX);
  }, []);

  useLayoutEffect(() => {
    if (!stickToBottom) return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [props.lines.length, stickToBottom]);

  return (
    <div
      className="container"
      data-component="transcript-pair-stream"
      data-testid="transcript-scroll-container"
      ref={containerRef}
      onScroll={handleScroll}
      style={{
        flex: 1,
        overflow: 'auto',
        padding: '4px 18px 18px',
        background: 'var(--pp-bg)',
        maskImage: 'linear-gradient(180deg, transparent 0, black 12px, black 100%)',
        WebkitMaskImage: 'linear-gradient(180deg, transparent 0, black 12px, black 100%)',
      }}
    >
      {props.lines.length === 0 ? (
        <EmptyTranscript />
      ) : (
        <>
          <div role="list" aria-label="字幕ストリーム">
            {props.lines.map((line, index) => (
              <TranscriptPairItem
                key={line.segmentIdentifier}
                originalText={line.originalText}
                translatedText={line.translatedText}
                isFinal={line.isFinal}
                connectedToPrevious={line.precedingSegmentIdentifier !== null}
                hasTranslationContext={line.hasTranslationContext}
                age={ages[index] ?? 'fresh'}
                isLatest={index === props.lines.length - 1}
              />
            ))}
          </div>
          <div ref={bottomRef} aria-hidden="true" />
        </>
      )}
    </div>
  );
}
