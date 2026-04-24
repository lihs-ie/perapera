import { describe, expect, it } from 'vitest';
import { createComposeTranslationContextUseCase } from './compose-translation-context-use-case';
import { type PrecedingContext } from '../ports/translation-port';

const build = (count: number): PrecedingContext[] =>
  Array.from({ length: count }, (_, i) => ({
    segmentId: `seg_${i + 1}`,
    sourceText: `source ${i + 1}`,
    translatedText: `target ${i + 1}`,
    finalizedAt: `2026-04-24T00:00:${String(i).padStart(2, '0')}.000Z`,
  }));

describe('ComposeTranslationContextUseCase (IMPL-404)', () => {
  const compose = createComposeTranslationContextUseCase();

  it('returns empty array when maxSegments=0', () => {
    const tail = build(3);
    expect(compose({ finalTail: tail, maxSegments: 0, includeTranslatedText: true })).toEqual([]);
  });

  it('returns empty array when finalTail is empty', () => {
    expect(compose({ finalTail: [], maxSegments: 3, includeTranslatedText: true })).toEqual([]);
  });

  it('returns all items when tail is shorter than maxSegments', () => {
    const tail = build(2);
    const result = compose({ finalTail: tail, maxSegments: 5, includeTranslatedText: true });
    expect(result.length).toBe(2);
    expect(result[0]!.segmentId).toBe('seg_1');
    expect(result[1]!.segmentId).toBe('seg_2');
  });

  it('keeps the last maxSegments items when tail exceeds the cap', () => {
    const tail = build(5);
    const result = compose({ finalTail: tail, maxSegments: 3, includeTranslatedText: true });
    expect(result.length).toBe(3);
    expect(result.map((entry) => entry.segmentId)).toEqual(['seg_3', 'seg_4', 'seg_5']);
  });

  it('strips translatedText when includeTranslatedText=false', () => {
    const tail = build(2);
    const result = compose({ finalTail: tail, maxSegments: 5, includeTranslatedText: false });
    expect(result.length).toBe(2);
    expect(result[0]!.translatedText).toBeUndefined();
    expect(result[1]!.translatedText).toBeUndefined();
    expect(result[0]!.sourceText).toBe('source 1');
  });

  it('preserves input order (oldest → newest)', () => {
    const tail = build(3);
    const result = compose({ finalTail: tail, maxSegments: 3, includeTranslatedText: true });
    expect(result).toEqual(tail);
  });
});
