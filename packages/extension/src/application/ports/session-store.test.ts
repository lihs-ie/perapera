import { errAsync, okAsync } from 'neverthrow';
import { describe, expect, it } from 'vitest';
import { createLanguagePair } from '../../domain/session/language-pair';
import {
  parseSessionIdentifier,
  type SessionIdentifier,
} from '../../domain/session/session-identifier';
import { createSourceSession, type SourceSession } from '../../domain/session/source-session';
import {
  invariantViolationError,
  notFoundError,
  type DomainError,
} from '../../domain/shared/errors';
import { createTimestampRange } from '../../domain/transcript/timestamp-range';
import {
  createPartialTranscriptSegment,
  type TranscriptSegment,
} from '../../domain/transcript/transcript-segment';
import { createTranscriptStream } from '../../domain/transcript/transcript-stream';
import {
  createCompletedTranslationSegment,
  type TranslationSegment,
} from '../../domain/transcript/translation-segment';
import { type ExportBundle, type SessionStore } from './session-store';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const SOURCE_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7B1';
const SEGMENT_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7D1';
const TRANSLATION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7E1';

const sessionIdentifier: SessionIdentifier = parseSessionIdentifier(SESSION_ID)._unsafeUnwrap();

const buildSession = (): SourceSession =>
  createSourceSession({
    sessionIdentifier: SESSION_ID,
    sourceIdentifier: SOURCE_ID,
    sourceType: 'tab',
    languagePair: createLanguagePair({ source: 'en-US', target: 'ja-JP' })._unsafeUnwrap(),
    startedAt: '2026-04-21T00:00:00.000Z',
  })._unsafeUnwrap();

const buildSegment = (): TranscriptSegment =>
  createPartialTranscriptSegment({
    segmentIdentifier: SEGMENT_ID,
    revision: 1,
    text: 'hello',
    timeRange: createTimestampRange({ startMs: 0, endMs: 1500 })._unsafeUnwrap(),
  })._unsafeUnwrap();

const buildTranslation = (): TranslationSegment =>
  createCompletedTranslationSegment({
    translationIdentifier: TRANSLATION_ID,
    segmentIdentifier: SEGMENT_ID,
    targetLanguage: 'ja-JP',
    text: 'こんにちは',
  })._unsafeUnwrap();

const buildBundle = (): ExportBundle => ({
  session: buildSession(),
  stream: createTranscriptStream({ sessionIdentifier: SESSION_ID })._unsafeUnwrap(),
});

const okMock: SessionStore = {
  saveSession: () => okAsync(undefined),
  appendTranscript: () => okAsync(undefined),
  appendTranslation: () => okAsync(undefined),
  loadExportBundle: () => okAsync(buildBundle()),
};

describe('SessionStore (DD-106)', () => {
  describe('type contract', () => {
    it('accepts an object literal that implements all four required methods', () => {
      expect(typeof okMock.saveSession).toBe('function');
      expect(typeof okMock.appendTranscript).toBe('function');
      expect(typeof okMock.appendTranslation).toBe('function');
      expect(typeof okMock.loadExportBundle).toBe('function');
    });
  });

  describe('saveSession', () => {
    it('resolves to ok(void) on success', async () => {
      const result = await okMock.saveSession(buildSession());
      expect(result.isOk()).toBe(true);
    });
  });

  describe('appendTranscript and appendTranslation', () => {
    it('both resolve to ok(void) on success (append-only semantics)', async () => {
      const t = await okMock.appendTranscript(sessionIdentifier, buildSegment());
      const tr = await okMock.appendTranslation(sessionIdentifier, buildTranslation());
      expect(t.isOk()).toBe(true);
      expect(tr.isOk()).toBe(true);
    });

    it('can return invariantViolationError when storage fails (hot-path continues regardless)', async () => {
      const mock: SessionStore = {
        ...okMock,
        appendTranscript: () =>
          errAsync<void, DomainError>(
            invariantViolationError({
              invariant: 'session-persistence',
              details: 'IndexedDB quota exceeded',
            }),
          ),
      };
      const result = await mock.appendTranscript(sessionIdentifier, buildSegment());
      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.kind).toBe('invariant-violation');
    });
  });

  describe('loadExportBundle', () => {
    it('returns session and stream as an ExportBundle', async () => {
      const result = await okMock.loadExportBundle(sessionIdentifier);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.session.sessionIdentifier).toBe(SESSION_ID);
        expect(result.value.stream.sessionIdentifier).toBe(SESSION_ID);
      }
    });

    it('returns notFoundError when session does not exist', async () => {
      const mock: SessionStore = {
        ...okMock,
        loadExportBundle: (id) =>
          errAsync<ExportBundle, DomainError>(
            notFoundError({ resourceType: 'SourceSession', identifier: id }),
          ),
      };
      const result = await mock.loadExportBundle(sessionIdentifier);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.kind).toBe('not-found');
    });
  });
});
