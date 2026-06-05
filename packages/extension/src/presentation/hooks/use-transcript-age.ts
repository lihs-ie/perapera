import { useMemo } from 'react';

export type TranscriptAge = 'fresh' | 'recent' | 'old';

const RECENT_WINDOW = 2;

/**
 * 末尾の line を `fresh`、末尾から `RECENT_WINDOW - 1` 個を `recent`、
 * それ以前を `old` に分類する純粋 hook。
 *
 * mock perapera-toolbar.jsx LiveTranscriptStream で fresh → recent → old と
 * 段階的に減衰する挙動を、毎レンダリング一括算出で再現する。
 */
export function useTranscriptAges(linesLength: number): readonly TranscriptAge[] {
  return useMemo(() => {
    const ages: TranscriptAge[] = [];
    for (let i = 0; i < linesLength; i += 1) {
      const distFromEnd = linesLength - 1 - i;
      if (distFromEnd === 0) {
        ages.push('fresh');
      } else if (distFromEnd < RECENT_WINDOW) {
        ages.push('recent');
      } else {
        ages.push('old');
      }
    }
    return ages;
  }, [linesLength]);
}
