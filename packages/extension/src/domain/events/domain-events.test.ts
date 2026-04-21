import { describe, expect, it } from 'vitest';
import { createLanguagePair } from '../session/language-pair.js';
import { createSourceSession } from '../session/source-session.js';
import { createPartialTranscriptSegment } from '../transcript/transcript-segment.js';
import { createTimestampRange } from '../transcript/timestamp-range.js';
import { createCompletedTranslationSegment } from '../transcript/translation-segment.js';
import {
  sourceSessionDegraded,
  sourceSessionStarted,
  sourceSessionStopped,
  transcriptFinalized,
  transcriptPartialUpdated,
  translationCompleted,
  type DomainEvent,
} from './domain-events.js';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const SOURCE_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7B1';
const SEGMENT_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7D1';
const TRANSLATION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7E1';
const STARTED_AT = '2026-04-21T00:00:00.000Z';
const FINALIZED_AT = '2026-04-21T00:00:05.000Z';
const OCCURRED_AT = '2026-04-21T00:01:00.000Z';
const STOPPED_AT = '2026-04-21T00:10:00.000Z';

const languagePair = createLanguagePair({ source: 'en-US', target: 'ja-JP' })._unsafeUnwrap();

const buildSession = () =>
  createSourceSession({
    sessionIdentifier: SESSION_ID,
    sourceIdentifier: SOURCE_ID,
    sourceType: 'tab',
    languagePair,
    startedAt: STARTED_AT,
  })._unsafeUnwrap();

const buildFinalSegment = () =>
  createPartialTranscriptSegment({
    segmentIdentifier: SEGMENT_ID,
    revision: 1,
    text: 'hello',
    timeRange: createTimestampRange({ startMs: 0, endMs: 1500 })._unsafeUnwrap(),
  })._unsafeUnwrap();

const buildCompletedTranslation = () => {
  const translation = createCompletedTranslationSegment({
    translationIdentifier: TRANSLATION_ID,
    segmentIdentifier: SEGMENT_ID,
    targetLanguage: 'ja-JP',
    text: 'こんにちは',
  })._unsafeUnwrap();
  if (translation.status !== 'completed') {
    throw new Error('expected completed translation');
  }
  return translation;
};

describe('Domain events', () => {
  describe('sourceSessionStarted (DD-250)', () => {
    it('captures identifiers, sourceType, and startedAt from the session', () => {
      const event = sourceSessionStarted(buildSession());
      expect(event.type).toBe('source-session-started');
      expect(event.sessionIdentifier).toBe(SESSION_ID);
      expect(event.sourceIdentifier).toBe(SOURCE_ID);
      expect(event.sourceType).toBe('tab');
      expect(event.startedAt).toBe(STARTED_AT);
    });
  });

  describe('transcriptPartialUpdated (DD-251)', () => {
    it('captures sessionIdentifier, segmentIdentifier, revision, and text', () => {
      const session = buildSession();
      const segment = buildFinalSegment();
      const event = transcriptPartialUpdated({
        sessionIdentifier: session.sessionIdentifier,
        segment,
      });
      expect(event.type).toBe('transcript-partial-updated');
      expect(event.sessionIdentifier).toBe(SESSION_ID);
      expect(event.segmentIdentifier).toBe(SEGMENT_ID);
      expect(event.revision).toBe(1);
      expect(event.text).toBe('hello');
    });
  });

  describe('transcriptFinalized (DD-252)', () => {
    it('captures segment text and the finalizedAt timestamp', () => {
      const session = buildSession();
      const segment = buildFinalSegment();
      const event = transcriptFinalized({
        sessionIdentifier: session.sessionIdentifier,
        segment,
        finalizedAt: FINALIZED_AT,
      });
      expect(event.type).toBe('transcript-finalized');
      expect(event.sessionIdentifier).toBe(SESSION_ID);
      expect(event.segmentIdentifier).toBe(SEGMENT_ID);
      expect(event.text).toBe('hello');
      expect(event.finalizedAt).toBe(FINALIZED_AT);
    });
  });

  describe('translationCompleted (DD-253)', () => {
    it('captures translationIdentifier, segmentIdentifier, and text', () => {
      const session = buildSession();
      const translation = buildCompletedTranslation();
      const event = translationCompleted({
        sessionIdentifier: session.sessionIdentifier,
        translation,
      });
      expect(event.type).toBe('translation-completed');
      expect(event.sessionIdentifier).toBe(SESSION_ID);
      expect(event.segmentIdentifier).toBe(SEGMENT_ID);
      expect(event.translationIdentifier).toBe(TRANSLATION_ID);
      expect(event.text).toBe('こんにちは');
    });
  });

  describe('sourceSessionDegraded (DD-254)', () => {
    it('captures reason and occurredAt', () => {
      const session = buildSession();
      const event = sourceSessionDegraded({
        sessionIdentifier: session.sessionIdentifier,
        reason: 'translation provider timeout',
        occurredAt: OCCURRED_AT,
      });
      expect(event.type).toBe('source-session-degraded');
      expect(event.sessionIdentifier).toBe(SESSION_ID);
      expect(event.reason).toBe('translation provider timeout');
      expect(event.occurredAt).toBe(OCCURRED_AT);
    });
  });

  describe('sourceSessionStopped (DD-255)', () => {
    it('captures stoppedAt and reason when user explicitly stops', () => {
      const session = buildSession();
      const event = sourceSessionStopped({
        sessionIdentifier: session.sessionIdentifier,
        stoppedAt: STOPPED_AT,
        reason: 'user_requested_stop',
      });
      expect(event.type).toBe('source-session-stopped');
      expect(event.sessionIdentifier).toBe(SESSION_ID);
      expect(event.stoppedAt).toBe(STOPPED_AT);
      expect(event.reason).toBe('user_requested_stop');
    });

    it('allows reason to be null for implicit shutdown cases', () => {
      const session = buildSession();
      const event = sourceSessionStopped({
        sessionIdentifier: session.sessionIdentifier,
        stoppedAt: STOPPED_AT,
        reason: null,
      });
      expect(event.reason).toBeNull();
    });
  });

  describe('DomainEvent discriminated union', () => {
    it('narrows payload via the type discriminator', () => {
      const events: DomainEvent[] = [
        sourceSessionStarted(buildSession()),
        transcriptPartialUpdated({
          sessionIdentifier: buildSession().sessionIdentifier,
          segment: buildFinalSegment(),
        }),
      ];

      const started = events.find((e) => e.type === 'source-session-started');
      expect(started).toBeDefined();
      if (started?.type === 'source-session-started') {
        // Within this guard, TypeScript narrows `started` to SourceSessionStarted;
        // access of `sourceType` (field specific to this variant) verifies the union.
        expect(started.sourceType).toBe('tab');
      }

      const partial = events.find((e) => e.type === 'transcript-partial-updated');
      expect(partial).toBeDefined();
      if (partial?.type === 'transcript-partial-updated') {
        expect(partial.revision).toBe(1);
      }
    });
  });
});
