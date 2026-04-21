import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  parseSessionIdentifier,
  type SessionIdentifier,
} from '../../domain/session/session-identifier';
import { createTimestampRange } from '../../domain/transcript/timestamp-range';
import {
  createPartialTranscriptSegment,
  finalizeTranscriptSegment,
  type TranscriptSegment,
} from '../../domain/transcript/transcript-segment';
import {
  createCompletedTranslationSegment,
  createFailedTranslationSegment,
  type TranslationSegment,
} from '../../domain/transcript/translation-segment';
import { INDEXED_DB_NAME } from './open-perapera-db';
import {
  createIndexedDbTranscriptStreamRepository,
  type CloseableTranscriptStreamRepository,
} from './indexed-db-transcript-stream-repository';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const SESSION_ID_OTHER = '01HZX8Y1R8M7D3Q2P4T5V6W7A2';
const SEGMENT_ID_1 = '01HZX8Y1R8M7D3Q2P4T5V6W7D1';
const SEGMENT_ID_2 = '01HZX8Y1R8M7D3Q2P4T5V6W7D2';
const TRANSLATION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7E1';
const TRANSLATION_ID_2 = '01HZX8Y1R8M7D3Q2P4T5V6W7E2';

const identifier: SessionIdentifier = parseSessionIdentifier(SESSION_ID)._unsafeUnwrap();
const otherIdentifier: SessionIdentifier = parseSessionIdentifier(SESSION_ID_OTHER)._unsafeUnwrap();

const buildPartial = (segmentId: string, revision = 1): TranscriptSegment =>
  createPartialTranscriptSegment({
    segmentIdentifier: segmentId,
    revision,
    text: 'hello',
    timeRange: createTimestampRange({ startMs: 0, endMs: 1000 })._unsafeUnwrap(),
  })._unsafeUnwrap();

const finalize = (partial: TranscriptSegment): TranscriptSegment =>
  finalizeTranscriptSegment(partial, {})._unsafeUnwrap();

const buildCompletedTranslation = (segmentId: string, translationId: string): TranslationSegment =>
  createCompletedTranslationSegment({
    translationIdentifier: translationId,
    segmentIdentifier: segmentId,
    targetLanguage: 'ja-JP',
    text: 'こんにちは',
  })._unsafeUnwrap();

describe('createIndexedDbTranscriptStreamRepository (IMPL-141, DD-261)', () => {
  let repo: CloseableTranscriptStreamRepository;
  let databaseName: string;

  beforeEach(() => {
    databaseName = `${INDEXED_DB_NAME}-test-${String(Math.random()).slice(2)}`;
    repo = createIndexedDbTranscriptStreamRepository({ databaseName });
  });

  afterEach(async () => {
    await repo.close();
  });

  describe('findBySessionId', () => {
    it('returns notFound when no segments or translations exist', async () => {
      const result = await repo.findBySessionId(identifier);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.kind).toBe('not-found');
        if (result.error.kind === 'not-found') {
          expect(result.error.resourceType).toBe('TranscriptStream');
          expect(result.error.identifier).toBe(SESSION_ID);
        }
      }
    });

    it('returns the stream with appended partial segments', async () => {
      await repo.appendPartial(identifier, buildPartial(SEGMENT_ID_1));
      const result = await repo.findBySessionId(identifier);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.sessionIdentifier).toBe(SESSION_ID);
        expect(result.value.segments.size).toBe(1);
        expect(result.value.segments.get(SEGMENT_ID_1)?.isFinal).toBe(false);
      }
    });

    it('isolates segments per sessionId', async () => {
      await repo.appendPartial(identifier, buildPartial(SEGMENT_ID_1));
      await repo.appendPartial(otherIdentifier, buildPartial(SEGMENT_ID_2));

      const a = await repo.findBySessionId(identifier);
      const b = await repo.findBySessionId(otherIdentifier);
      expect(a.isOk() && a.value.segments.size).toBe(1);
      expect(b.isOk() && b.value.segments.size).toBe(1);
      if (a.isOk()) {
        expect(a.value.segments.has(SEGMENT_ID_1)).toBe(true);
        expect(a.value.segments.has(SEGMENT_ID_2)).toBe(false);
      }
    });
  });

  describe('appendPartial', () => {
    it('stores a partial segment without guards', async () => {
      const result = await repo.appendPartial(identifier, buildPartial(SEGMENT_ID_1));
      expect(result.isOk()).toBe(true);
    });
  });

  describe('appendFinal — defensive guard', () => {
    it('rejects when segment.isFinal is false with append-final-requires-final-segment', async () => {
      const partial = buildPartial(SEGMENT_ID_1);
      const result = await repo.appendFinal(identifier, partial);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.kind).toBe('invariant-violation');
        if (result.error.kind === 'invariant-violation') {
          expect(result.error.invariant).toBe('append-final-requires-final-segment');
        }
      }
    });

    it('stores a final segment when isFinal=true', async () => {
      const final = finalize(buildPartial(SEGMENT_ID_1));
      const result = await repo.appendFinal(identifier, final);
      expect(result.isOk()).toBe(true);

      const bundle = await repo.findBySessionId(identifier);
      expect(bundle.isOk()).toBe(true);
      if (bundle.isOk()) {
        expect(bundle.value.segments.get(SEGMENT_ID_1)?.isFinal).toBe(true);
      }
    });
  });

  describe('appendTranslation — defensive guard', () => {
    it('rejects when no final segment exists with translation-requires-final-segment', async () => {
      const translation = buildCompletedTranslation(SEGMENT_ID_1, TRANSLATION_ID);
      const result = await repo.appendTranslation(identifier, translation);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.kind).toBe('invariant-violation');
        if (result.error.kind === 'invariant-violation') {
          expect(result.error.invariant).toBe('translation-requires-final-segment');
        }
      }
    });

    it('rejects when only a partial (non-final) segment exists for the session', async () => {
      await repo.appendPartial(identifier, buildPartial(SEGMENT_ID_1));
      const translation = buildCompletedTranslation(SEGMENT_ID_1, TRANSLATION_ID);
      const result = await repo.appendTranslation(identifier, translation);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.kind).toBe('invariant-violation');
      }
    });

    it('accepts a translation after the corresponding final segment is present', async () => {
      const final = finalize(buildPartial(SEGMENT_ID_1));
      await repo.appendFinal(identifier, final);
      const translation = buildCompletedTranslation(SEGMENT_ID_1, TRANSLATION_ID);
      const result = await repo.appendTranslation(identifier, translation);
      expect(result.isOk()).toBe(true);

      const bundle = await repo.findBySessionId(identifier);
      expect(bundle.isOk()).toBe(true);
      if (bundle.isOk()) {
        const t = bundle.value.translations.get(SEGMENT_ID_1);
        expect(t?.status).toBe('completed');
      }
    });

    it('accepts a failed translation once the matching final segment is present', async () => {
      const final = finalize(buildPartial(SEGMENT_ID_1));
      await repo.appendFinal(identifier, final);
      const failed = createFailedTranslationSegment({
        translationIdentifier: TRANSLATION_ID_2,
        segmentIdentifier: SEGMENT_ID_1,
        targetLanguage: 'ja-JP',
      })._unsafeUnwrap();
      const result = await repo.appendTranslation(identifier, failed);
      expect(result.isOk()).toBe(true);
    });
  });
});
