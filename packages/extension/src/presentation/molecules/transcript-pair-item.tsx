import type { CSSProperties } from 'react';
import { CursorBlink } from '../atoms/cursor-blink';
import type { TranscriptAge } from '../hooks/use-transcript-age';

export type Props = Readonly<{
  originalText: string | null;
  translatedText: string | null;
  isFinal: boolean;
  speakerLabel?: string;
  connectedToPrevious?: boolean;
  hasTranslationContext?: boolean;
  isLatest?: boolean;
  age?: TranscriptAge;
  density?: 'comfortable' | 'compact';
  time?: string;
  isBookmarked?: boolean;
  onToggleBookmark?: () => void;
}>;

/**
 * TranscriptPairItem molecule (perapera-transcript.jsx TranscriptItem 移植)。
 *
 * 1 segment の「話者ラベル + 原文 + 翻訳」ペアを描画。
 * 左に accent rail、age に応じた opacity (fresh=1 / recent=0.75 / old=0.45)、
 * connected 時は header 省略 + border-bottom 非表示で chain 表現、
 * partial 時は LISTENING… ラベル + 末尾 Cursor を表示。
 * hasTranslationContext=true の場合は ·CTX バッジを表示。
 */
export function TranscriptPairItem(props: Props) {
  const label = props.speakerLabel ?? 'OTHER';
  const original = props.originalText ?? '';
  const translation = props.translatedText ?? '';
  const partial = !props.isFinal;
  const connected = props.connectedToPrevious === true;
  const hasContext = props.hasTranslationContext === true;
  const compact = props.density === 'compact';
  const age = props.age ?? 'fresh';
  const isLatest = props.isLatest === true;

  const ageOpacity = age === 'old' ? 0.45 : age === 'recent' ? 0.75 : 1;
  const railTop = connected ? -2 : compact ? 12 : 16;
  const railBackground = partial
    ? 'linear-gradient(180deg, var(--pp-accent) 0%, rgba(45,212,191,0.35) 100%)'
    : connected
      ? 'var(--pp-accent-dim)'
      : 'var(--pp-accent)';
  const railOpacity = connected ? 0.45 : partial ? 1 : 0.85;

  const itemStyle: CSSProperties = {
    position: 'relative',
    paddingLeft: 18,
    paddingTop: connected ? 2 : compact ? 10 : 14,
    paddingBottom: compact ? 8 : 12,
    paddingRight: 4,
    borderBottom: connected ? 'none' : '1px solid rgba(255,255,255,0.06)',
    opacity: ageOpacity,
    transition: 'opacity 500ms ease',
    animation: isLatest && partial ? 'pp-fade-up 280ms ease both' : undefined,
  };

  return (
    <div
      className="container"
      data-component="transcript-pair-item"
      role="listitem"
      aria-label={label}
      data-connected={connected ? 'true' : 'false'}
      data-context={hasContext ? 'true' : 'false'}
      data-partial={partial ? 'true' : 'false'}
      data-age={age}
      style={itemStyle}
    >
      <span
        aria-hidden="true"
        data-part="rail"
        style={{
          position: 'absolute',
          left: 4,
          top: railTop,
          bottom: 6,
          width: 2,
          borderRadius: 2,
          background: railBackground,
          opacity: railOpacity,
          boxShadow: partial ? '0 0 8px rgba(45,212,191,0.35)' : 'none',
        }}
      />
      {connected ? null : (
        <div
          data-part="header"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 6,
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--pp-font-numeric)',
              fontSize: 9.5,
              fontWeight: 500,
              letterSpacing: '0.14em',
              color: 'var(--pp-text-dim)',
            }}
          >
            {label}
          </span>
          {props.time !== undefined && props.time !== '' ? (
            <span
              style={{
                fontFamily: 'var(--pp-font-numeric)',
                fontSize: 9.5,
                fontWeight: 500,
                color: 'var(--pp-text-dim)',
                opacity: 0.7,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {props.time}
            </span>
          ) : null}
          {hasContext ? (
            <span
              data-part="context-badge"
              title="文脈ありで翻訳"
              style={{
                fontFamily: 'var(--pp-font-numeric)',
                fontSize: 9,
                fontWeight: 500,
                color: 'var(--pp-accent-bright)',
                padding: '1px 5px',
                background: 'rgba(45,212,191,0.10)',
                border: '1px solid rgba(45,212,191,0.18)',
                borderRadius: 3,
                letterSpacing: '0.06em',
              }}
            >
              ·CTX
            </span>
          ) : null}
          {partial ? (
            <span
              data-part="listening"
              style={{
                fontFamily: 'var(--pp-font-numeric)',
                fontSize: 9,
                fontWeight: 500,
                color: 'var(--pp-accent)',
                letterSpacing: '0.10em',
              }}
            >
              LISTENING…
            </span>
          ) : null}
          {props.isFinal && props.onToggleBookmark !== undefined ? (
            <button
              type="button"
              data-part="bookmark"
              data-active={props.isBookmarked === true ? 'true' : 'false'}
              aria-label={props.isBookmarked === true ? 'ブックマークを外す' : 'ブックマークに追加'}
              aria-pressed={props.isBookmarked === true}
              onClick={props.onToggleBookmark}
              style={{
                marginLeft: 'auto',
                background: 'transparent',
                border: 'none',
                color: props.isBookmarked === true ? 'var(--pp-accent)' : 'var(--pp-text-muted)',
                cursor: 'pointer',
                fontSize: 13,
                padding: 2,
                lineHeight: 1,
              }}
            >
              {props.isBookmarked === true ? '★' : '☆'}
            </button>
          ) : null}
        </div>
      )}
      {original.length > 0 ? (
        <p
          data-part="original"
          style={{
            margin: 0,
            fontFamily: 'var(--pp-font-body)',
            fontSize: 13,
            lineHeight: 1.55,
            fontWeight: 400,
            color: partial ? 'rgba(125,138,156,0.65)' : 'var(--pp-text-muted)',
            fontStyle: partial ? 'italic' : 'normal',
            textWrap: 'pretty',
          }}
        >
          {original}
          {partial && translation.length === 0 ? <CursorBlink inline /> : null}
        </p>
      ) : null}
      {translation.length > 0 ? (
        <p
          data-part="translation"
          style={{
            margin: '5px 0 0',
            fontFamily: 'var(--pp-font-body)',
            fontSize: compact ? 14.5 : 16,
            lineHeight: 1.5,
            fontWeight: props.isFinal ? 600 : 500,
            color: partial ? 'rgba(241,245,249,0.78)' : 'var(--pp-text-primary)',
            fontStyle: partial ? 'italic' : 'normal',
            letterSpacing: '0.005em',
            textWrap: 'pretty',
          }}
        >
          {translation}
          {partial ? <CursorBlink inline /> : null}
        </p>
      ) : null}
    </div>
  );
}
