import { describe, expect, it } from 'vitest';
import {
  createTranscriptStream,
  getSegment,
  getTranslation,
} from '../../domain/transcript/transcript-stream';
import { createTimestampRange } from '../../domain/transcript/timestamp-range';
import { createTranscriptAssembler } from './transcript-assembler';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const SEGMENT_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7B1';
const TRANSLATION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7C1';

const emptyStream = () => createTranscriptStream({ sessionIdentifier: SESSION_ID })._unsafeUnwrap();
const range = () => createTimestampRange({ startMs: 0, endMs: 1000 })._unsafeUnwrap();

describe('createTranscriptAssembler (IMPL-343)', () => {
  it('apply with partial event appends a new partial segment', () => {
    const assembler = createTranscriptAssembler();
    const result = assembler.apply(emptyStream(), {
      type: 'partial',
      segmentIdentifier: SEGMENT_ID,
      revision: 1,
      text: 'hello',
      timeRange: range(),
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const segment = getSegment(result.value, SEGMENT_ID);
      expect(segment).not.toBeUndefined();
      expect(segment?.text).toBe('hello');
      expect(segment?.isFinal).toBe(false);
    }
  });

  it('apply with partial event updates an existing partial segment when revision is higher', () => {
    const assembler = createTranscriptAssembler();
    const first = assembler
      .apply(emptyStream(), {
        type: 'partial',
        segmentIdentifier: SEGMENT_ID,
        revision: 1,
        text: 'he',
        timeRange: range(),
      })
      ._unsafeUnwrap();
    const second = assembler.apply(first, {
      type: 'partial',
      segmentIdentifier: SEGMENT_ID,
      revision: 2,
      text: 'hello',
      timeRange: range(),
    });
    expect(second.isOk()).toBe(true);
    if (second.isOk()) {
      expect(getSegment(second.value, SEGMENT_ID)?.text).toBe('hello');
    }
  });

  it('apply with final event without prior partial requires text and timeRange', () => {
    const assembler = createTranscriptAssembler();
    const result = assembler.apply(emptyStream(), {
      type: 'final',
      segmentIdentifier: SEGMENT_ID,
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('invariant-violation');
  });

  it('apply with final event after partial marks the segment as final', () => {
    const assembler = createTranscriptAssembler();
    const partial = assembler
      .apply(emptyStream(), {
        type: 'partial',
        segmentIdentifier: SEGMENT_ID,
        revision: 1,
        text: 'hello',
        timeRange: range(),
      })
      ._unsafeUnwrap();
    const finalResult = assembler.apply(partial, {
      type: 'final',
      segmentIdentifier: SEGMENT_ID,
    });
    expect(finalResult.isOk()).toBe(true);
    if (finalResult.isOk()) {
      expect(getSegment(finalResult.value, SEGMENT_ID)?.isFinal).toBe(true);
    }
  });

  it('apply with translation event attaches translation to finalized segment', () => {
    const assembler = createTranscriptAssembler();
    const finalized = assembler
      .apply(emptyStream(), {
        type: 'partial',
        segmentIdentifier: SEGMENT_ID,
        revision: 1,
        text: 'hello',
        timeRange: range(),
      })
      .andThen((s) =>
        assembler.apply(s, {
          type: 'final',
          segmentIdentifier: SEGMENT_ID,
        }),
      )
      ._unsafeUnwrap();
    const translated = assembler.apply(finalized, {
      type: 'translation',
      translationIdentifier: TRANSLATION_ID,
      segmentIdentifier: SEGMENT_ID,
      targetLanguage: 'ja',
      text: 'こんにちは',
    });
    expect(translated.isOk()).toBe(true);
    if (translated.isOk()) {
      const translation = getTranslation(translated.value, SEGMENT_ID);
      expect(translation).not.toBeUndefined();
      if (translation?.status === 'completed') {
        expect(translation.text).toBe('こんにちは');
      }
    }
  });

  it('apply with translation event before finalization returns invariant-violation', () => {
    const assembler = createTranscriptAssembler();
    const partial = assembler
      .apply(emptyStream(), {
        type: 'partial',
        segmentIdentifier: SEGMENT_ID,
        revision: 1,
        text: 'hello',
        timeRange: range(),
      })
      ._unsafeUnwrap();
    const translated = assembler.apply(partial, {
      type: 'translation',
      translationIdentifier: TRANSLATION_ID,
      segmentIdentifier: SEGMENT_ID,
      targetLanguage: 'ja',
      text: 'こんにちは',
    });
    expect(translated.isErr()).toBe(true);
    if (translated.isErr()) expect(translated.error.kind).toBe('invariant-violation');
  });
});
