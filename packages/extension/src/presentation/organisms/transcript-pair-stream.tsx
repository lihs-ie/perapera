import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { type OverlayLine } from '../../application/ports/overlay-presenter';
import { TranscriptPairItem } from '../molecules/transcript-pair-item';

export type Props = Readonly<{
  lines: readonly OverlayLine[];
}>;

/**
 * 最下部とみなす許容差 (px)。ユーザーのマウスホイール / trackpad 操作で
 * ちょうど最下部でない場合でも、数十 px 以内なら "stick" として扱う。
 */
const STICK_THRESHOLD_PX = 40;

/**
 * TranscriptPairStream organism。
 *
 * Main window 内で OverlayLine の並びを受け取り、原文 (gray) + 翻訳 (white bold)
 * ペアのリストを描画する。MainWindowTemplate の `active` 状態で直接配置され、
 * 自身が scroll container を兼ねる (class `body`、`data-variant='stream'`)。
 *
 * **スクロール挙動 (yaku 風)**:
 * - 初期状態は stick-to-bottom (常に最新行を表示)
 * - ユーザーが上にスクロールすると auto-scroll を抑制し、過去ログを自由に遡れる
 * - ユーザーが最下部近く (`STICK_THRESHOLD_PX` 以内) に戻ると stick-to-bottom を
 *   再有効化し、以降の新規 line 追加で最新行まで自動スクロール
 *
 * 空配列時は empty placeholder を返す。
 */
export function TranscriptPairStream(props: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [stickToBottom, setStickToBottom] = useState(true);

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
      className="body"
      data-variant="stream"
      data-testid="transcript-scroll-container"
      ref={containerRef}
      onScroll={handleScroll}
    >
      {props.lines.length === 0 ? (
        <div className="empty" aria-label="字幕プレースホルダ">
          <p className="message">セッションを開始すると字幕と翻訳がここに表示されます。</p>
        </div>
      ) : (
        <>
          <div className="list" role="list" aria-label="字幕ストリーム">
            {props.lines.map((line) => (
              <TranscriptPairItem
                key={line.segmentIdentifier}
                originalText={line.originalText}
                translatedText={line.translatedText}
                isFinal={line.isFinal}
              />
            ))}
          </div>
          <div ref={bottomRef} aria-hidden="true" />
        </>
      )}
    </div>
  );
}
