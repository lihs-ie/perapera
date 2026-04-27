import { PPMark } from '../atoms/pp-mark';

type Props = Readonly<{
  message?: string;
}>;

/**
 * EmptyTranscript molecule (perapera-transcript.jsx EmptyTranscript 移植)。
 *
 * Transcript ストリームが空の時に PPMark + 案内テキストを中央に表示する。
 * 既定文言は mock の `<br/>` 改行に合わせて 2 行で描画する。
 */
export function EmptyTranscript(props: Props) {
  return (
    <div
      className="container"
      data-component="empty-transcript"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        padding: 32,
        textAlign: 'center',
      }}
    >
      <div
        data-part="mark-frame"
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'rgba(45,212,191,0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid var(--pp-border)',
        }}
      >
        <PPMark size={28} />
      </div>
      <p
        style={{
          margin: 0,
          fontFamily: 'var(--pp-font-body)',
          fontSize: 13.5,
          color: 'var(--pp-text-muted)',
          maxWidth: 280,
          lineHeight: 1.6,
        }}
      >
        {props.message ?? (
          <>
            セッションを開始すると
            <br />
            字幕と翻訳がここに表示されます
          </>
        )}
      </p>
    </div>
  );
}
