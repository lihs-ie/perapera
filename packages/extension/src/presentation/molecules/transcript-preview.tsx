export type TranscriptPreviewLine = Readonly<{
  sessionId: string;
  segmentId: string;
  originalText?: string | undefined;
  translatedText?: string | undefined;
}>;

export type Props = Readonly<{
  sessionId: string;
  segments: readonly TranscriptPreviewLine[];
  /** 表示する segment の上限 (既定 3 件、新しい順) */
  limit?: number;
}>;

/**
 * IMPL-534 TranscriptPreview molecule。
 *
 * SessionMonitorState.latestSegments を source の最新 N 件分だけ抽出して表示。
 * SidePanel で「いま何が聞き取れているか」を確認する用途。空 state は
 * 「字幕なし」メッセージ。
 */
export function TranscriptPreview(props: Props) {
  const limit = props.limit ?? 3;
  const filtered = props.segments.filter((segment) => segment.sessionId === props.sessionId);
  const lines = filtered.slice(Math.max(0, filtered.length - limit));

  if (lines.length === 0) {
    return (
      <p className="message" data-variant="muted">
        字幕はまだありません。
      </p>
    );
  }

  return (
    <ul className="preview" aria-label="最新字幕">
      {lines.map((line) => (
        <li key={line.segmentId} className="line">
          {line.originalText !== undefined && line.originalText.length > 0 ? (
            <p className="original">{line.originalText}</p>
          ) : null}
          {line.translatedText !== undefined && line.translatedText.length > 0 ? (
            <p className="translated">{line.translatedText}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
