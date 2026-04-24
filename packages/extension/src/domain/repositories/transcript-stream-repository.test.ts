import { errAsync, okAsync } from 'neverthrow';
import { describe, expect, it } from 'vitest';
import { parseSessionIdentifier, type SessionIdentifier } from '../session/session-identifier';
import { invariantViolationError, notFoundError, type DomainError } from '../shared/errors';
import { createTimestampRange } from '../transcript/timestamp-range';
import {
  createPartialTranscriptSegment,
  finalizeTranscriptSegment,
  type TranscriptSegment,
} from '../transcript/transcript-segment';
import { createTranscriptStream, type TranscriptStream } from '../transcript/transcript-stream';
import {
  createCompletedTranslationSegment,
  type TranslationSegment,
} from '../transcript/translation-segment';
import { type TranscriptStreamRepository } from './transcript-stream-repository';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const SEGMENT_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7D1';
const TRANSLATION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7E1';

const sessionIdentifier: SessionIdentifier = parseSessionIdentifier(SESSION_ID)._unsafeUnwrap();

const buildStream = (): TranscriptStream =>
  createTranscriptStream({ sessionIdentifier: SESSION_ID })._unsafeUnwrap();

const buildPartialSegment = (): TranscriptSegment =>
  createPartialTranscriptSegment({
    segmentIdentifier: SEGMENT_ID,
    revision: 1,
    text: 'hello',
    timeRange: createTimestampRange({ startMs: 0, endMs: 1500 })._unsafeUnwrap(),
  })._unsafeUnwrap();

const buildFinalSegment = (): TranscriptSegment =>
  finalizeTranscriptSegment(buildPartialSegment(), {})._unsafeUnwrap();

const buildCompletedTranslation = (): TranslationSegment =>
  createCompletedTranslationSegment({
    translationIdentifier: TRANSLATION_ID,
    segmentIdentifier: SEGMENT_ID,
    targetLanguage: 'ja-JP',
    text: 'こんにちは',
  })._unsafeUnwrap();

const okMock: TranscriptStreamRepository = {
  findBySessionId: () => okAsync(buildStream()),
  appendPartial: () => okAsync(undefined),
  appendFinal: () => okAsync(undefined),
  appendTranslation: () => okAsync(undefined),
  search: () => okAsync([]),
  toggleBookmark: () => okAsync(undefined),
  findBookmarked: () => okAsync([]),
};

describe('TranscriptStreamRepository (DD-261)', () => {
  describe('type contract', () => {
    it('accepts an object literal that implements all four required methods', () => {
      expect(typeof okMock.findBySessionId).toBe('function');
      expect(typeof okMock.appendPartial).toBe('function');
      expect(typeof okMock.appendFinal).toBe('function');
      expect(typeof okMock.appendTranslation).toBe('function');
    });
  });

  describe('findBySessionId', () => {
    it('returns the TranscriptStream on the success path', async () => {
      const stream = buildStream();
      const mock: TranscriptStreamRepository = {
        ...okMock,
        findBySessionId: () => okAsync(stream),
      };
      const result = await mock.findBySessionId(sessionIdentifier);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value).toBe(stream);
    });

    it('returns notFoundError when no stream exists for the session', async () => {
      const mock: TranscriptStreamRepository = {
        ...okMock,
        findBySessionId: (id) =>
          errAsync<TranscriptStream, DomainError>(
            notFoundError({ resourceType: 'TranscriptStream', identifier: id }),
          ),
      };
      const result = await mock.findBySessionId(sessionIdentifier);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.kind).toBe('not-found');
        if (result.error.kind === 'not-found') {
          expect(result.error.resourceType).toBe('TranscriptStream');
        }
      }
    });
  });

  describe('appendPartial', () => {
    it('resolves to ok(void) on the success path', async () => {
      const result = await okMock.appendPartial(sessionIdentifier, buildPartialSegment());
      expect(result.isOk()).toBe(true);
    });
  });

  describe('appendFinal', () => {
    it('resolves to ok(void) when given a finalized segment', async () => {
      const result = await okMock.appendFinal(sessionIdentifier, buildFinalSegment());
      expect(result.isOk()).toBe(true);
    });

    it('can return invariantViolationError as a defensive guard for non-final segments', async () => {
      const mock: TranscriptStreamRepository = {
        ...okMock,
        appendFinal: () =>
          errAsync<void, DomainError>(
            invariantViolationError({
              invariant: 'append-final-requires-final-segment',
              details: 'segment.isFinal must be true',
            }),
          ),
      };
      const result = await mock.appendFinal(sessionIdentifier, buildPartialSegment());
      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.kind).toBe('invariant-violation');
    });
  });

  describe('appendTranslation', () => {
    it('resolves to ok(void) for a completed translation attached to a final segment', async () => {
      const result = await okMock.appendTranslation(sessionIdentifier, buildCompletedTranslation());
      expect(result.isOk()).toBe(true);
    });

    it('can return invariantViolationError when the target final segment is missing', async () => {
      const mock: TranscriptStreamRepository = {
        ...okMock,
        appendTranslation: () =>
          errAsync<void, DomainError>(
            invariantViolationError({
              invariant: 'translation-requires-final-segment',
              details: 'no matching finalized segment in stream',
            }),
          ),
      };
      const result = await mock.appendTranslation(sessionIdentifier, buildCompletedTranslation());
      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.kind).toBe('invariant-violation');
    });
  });
});
