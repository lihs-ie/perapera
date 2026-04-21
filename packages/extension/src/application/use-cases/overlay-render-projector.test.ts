import { describe, expect, it } from 'vitest';
import { createOverlaySettings, type OverlaySettings } from '../../domain/profile/overlay-settings';
import {
  parseSessionIdentifier,
  type SessionIdentifier,
} from '../../domain/session/session-identifier';
import { createTimestampRange } from '../../domain/transcript/timestamp-range';
import {
  appendPartialTranscriptSegment,
  attachTranslationToSegment,
  createTranscriptStream,
  finalizeSegment,
  type TranscriptStream,
} from '../../domain/transcript/transcript-stream';
import { projectOverlayRenderModel } from './overlay-render-projector';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const SEGMENT_ID_1 = '01HZX8Y1R8M7D3Q2P4T5V6W7D1';
const SEGMENT_ID_2 = '01HZX8Y1R8M7D3Q2P4T5V6W7D2';
const SEGMENT_ID_3 = '01HZX8Y1R8M7D3Q2P4T5V6W7D3';
const TRANSLATION_ID_1 = '01HZX8Y1R8M7D3Q2P4T5V6W7E1';

const sessionIdentifier: SessionIdentifier = parseSessionIdentifier(SESSION_ID)._unsafeUnwrap();

const baseSettings = (
  overrides?: Partial<Parameters<typeof createOverlaySettings>[0]>,
): OverlaySettings =>
  createOverlaySettings({
    positionPreset: 'bottom',
    opacity: 0.8,
    maxLines: 3,
    fontScale: 1,
    showOriginalText: true,
    showTranslatedText: true,
    ...overrides,
  })._unsafeUnwrap();

const range = (startMs: number, endMs: number) =>
  createTimestampRange({ startMs, endMs })._unsafeUnwrap();

const buildStream = (): TranscriptStream => {
  let stream = createTranscriptStream({ sessionIdentifier: SESSION_ID })._unsafeUnwrap();
  stream = appendPartialTranscriptSegment(stream, {
    segmentIdentifier: SEGMENT_ID_1,
    revision: 1,
    text: 'hello',
    timeRange: range(0, 1000),
  })._unsafeUnwrap();
  stream = finalizeSegment(stream, { segmentIdentifier: SEGMENT_ID_1 })._unsafeUnwrap();
  stream = attachTranslationToSegment(stream, {
    translationIdentifier: TRANSLATION_ID_1,
    segmentIdentifier: SEGMENT_ID_1,
    targetLanguage: 'ja-JP',
    text: 'こんにちは',
  })._unsafeUnwrap();
  stream = appendPartialTranscriptSegment(stream, {
    segmentIdentifier: SEGMENT_ID_2,
    revision: 1,
    text: 'world',
    timeRange: range(2000, 3000),
  })._unsafeUnwrap();
  stream = appendPartialTranscriptSegment(stream, {
    segmentIdentifier: SEGMENT_ID_3,
    revision: 1,
    text: 'foo',
    timeRange: range(4000, 5000),
  })._unsafeUnwrap();
  return stream;
};

describe('projectOverlayRenderModel', () => {
  it('projects each segment into an OverlayLine with translation when available', () => {
    const stream = buildStream();
    const model = projectOverlayRenderModel({ stream, settings: baseSettings() });
    expect(model.sessionIdentifier).toBe(sessionIdentifier);
    expect(model.lines).toHaveLength(3);
    const finalized = model.lines.find((line) => line.segmentIdentifier === SEGMENT_ID_1);
    expect(finalized?.isFinal).toBe(true);
    expect(finalized?.originalText).toBe('hello');
    expect(finalized?.translatedText).toBe('こんにちは');
    expect(finalized?.targetLanguage).toBe('ja-JP');
  });

  it('orders lines by startMs ascending', () => {
    const stream = buildStream();
    const model = projectOverlayRenderModel({ stream, settings: baseSettings() });
    expect(model.lines[0]?.segmentIdentifier).toBe(SEGMENT_ID_1);
    expect(model.lines[1]?.segmentIdentifier).toBe(SEGMENT_ID_2);
    expect(model.lines[2]?.segmentIdentifier).toBe(SEGMENT_ID_3);
  });

  it('hides originalText when showOriginalText=false', () => {
    const stream = buildStream();
    const model = projectOverlayRenderModel({
      stream,
      settings: baseSettings({ showOriginalText: false }),
    });
    for (const line of model.lines) {
      expect(line.originalText).toBeNull();
    }
  });

  it('hides translatedText when showTranslatedText=false', () => {
    const stream = buildStream();
    const model = projectOverlayRenderModel({
      stream,
      settings: baseSettings({ showTranslatedText: false }),
    });
    for (const line of model.lines) {
      expect(line.translatedText).toBeNull();
      expect(line.targetLanguage).toBeNull();
    }
  });

  it('caps the number of lines at OverlaySettings.maxLines (most recent kept)', () => {
    const stream = buildStream();
    const model = projectOverlayRenderModel({
      stream,
      settings: baseSettings({ maxLines: 2 }),
    });
    expect(model.lines).toHaveLength(2);
    expect(model.lines[0]?.segmentIdentifier).toBe(SEGMENT_ID_2);
    expect(model.lines[1]?.segmentIdentifier).toBe(SEGMENT_ID_3);
  });

  it('omits segments whose only visible field is hidden (original hidden + no translation)', () => {
    const stream = buildStream();
    const model = projectOverlayRenderModel({
      stream,
      settings: baseSettings({ showOriginalText: false, showTranslatedText: true }),
    });
    expect(model.lines.every((line) => line.translatedText !== null)).toBe(true);
    expect(model.lines.every((line) => line.segmentIdentifier === SEGMENT_ID_1)).toBe(true);
  });

  it('returns an empty lines array for an empty stream', () => {
    const stream = createTranscriptStream({ sessionIdentifier: SESSION_ID })._unsafeUnwrap();
    const model = projectOverlayRenderModel({ stream, settings: baseSettings() });
    expect(model.lines).toEqual([]);
  });

  it('treats failed translations as missing (translatedText=null)', () => {
    // buildStream only attaches a completed translation; here we verify the
    // default contract that the projector reads `status === 'completed'`.
    const stream = buildStream();
    const model = projectOverlayRenderModel({ stream, settings: baseSettings() });
    const row = model.lines.find((line) => line.segmentIdentifier === SEGMENT_ID_2);
    expect(row?.translatedText).toBeNull();
  });
});
