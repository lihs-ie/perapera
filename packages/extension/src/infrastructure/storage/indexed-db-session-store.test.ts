import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLanguagePair } from '../../domain/session/language-pair';
import { createSourceSession } from '../../domain/session/source-session';
import {
  parseSessionIdentifier,
  type SessionIdentifier,
} from '../../domain/session/session-identifier';
import { createTimestampRange } from '../../domain/transcript/timestamp-range';
import {
  createPartialTranscriptSegment,
  finalizeTranscriptSegment,
} from '../../domain/transcript/transcript-segment';
import {
  createCompletedTranslationSegment,
  createFailedTranslationSegment,
} from '../../domain/transcript/translation-segment';
import {
  createIndexedDbSessionStore,
  INDEXED_DB_NAME,
  type CloseableSessionStore,
} from './indexed-db-session-store';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const SOURCE_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7B1';
const SEGMENT_ID_1 = '01HZX8Y1R8M7D3Q2P4T5V6W7D1';
const SEGMENT_ID_2 = '01HZX8Y1R8M7D3Q2P4T5V6W7D2';
const TRANSLATION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7E1';

const sessionIdentifier: SessionIdentifier = parseSessionIdentifier(SESSION_ID)._unsafeUnwrap();

const buildSession = () =>
  createSourceSession({
    sessionIdentifier: SESSION_ID,
    sourceIdentifier: SOURCE_ID,
    sourceType: 'tab',
    languagePair: createLanguagePair({ source: 'en-US', target: 'ja-JP' })._unsafeUnwrap(),
    startedAt: '2026-04-21T00:00:00.000Z',
  })._unsafeUnwrap();

const buildPartial = (segmentId: string) =>
  createPartialTranscriptSegment({
    segmentIdentifier: segmentId,
    revision: 1,
    text: 'hello',
    timeRange: createTimestampRange({ startMs: 0, endMs: 1000 })._unsafeUnwrap(),
  })._unsafeUnwrap();

const buildCompletedTranslation = () =>
  createCompletedTranslationSegment({
    translationIdentifier: TRANSLATION_ID,
    segmentIdentifier: SEGMENT_ID_1,
    targetLanguage: 'ja-JP',
    text: 'こんにちは',
  })._unsafeUnwrap();

describe('createIndexedDbSessionStore (IMPL-310, DD-106 / DB-001〜004)', () => {
  let store: CloseableSessionStore;
  let databaseName: string;

  beforeEach(() => {
    // 各テストで独立した in-memory DB を使って干渉を避ける
    databaseName = `${INDEXED_DB_NAME}-test-${String(Math.random()).slice(2)}`;
    store = createIndexedDbSessionStore({ databaseName });
  });

  afterEach(async () => {
    await store.close();
  });

  describe('saveSession', () => {
    it('persists and retrieves a session via loadExportBundle', async () => {
      const store = createIndexedDbSessionStore();
      const session = buildSession();
      const saveResult = await store.saveSession(session);
      expect(saveResult.isOk()).toBe(true);

      const bundleResult = await store.loadExportBundle(sessionIdentifier);
      expect(bundleResult.isOk()).toBe(true);
      if (bundleResult.isOk()) {
        expect(bundleResult.value.session.sessionIdentifier).toBe(SESSION_ID);
        expect(bundleResult.value.stream.segments.size).toBe(0);
        expect(bundleResult.value.stream.translations.size).toBe(0);
      }
    });
  });

  describe('appendTranscript', () => {
    it('stores partial and finalized segments and returns them in the bundle', async () => {
      await store.saveSession(buildSession());

      const partial = buildPartial(SEGMENT_ID_1);
      await store.appendTranscript(sessionIdentifier, partial);
      const finalized = finalizeTranscriptSegment(partial, {})._unsafeUnwrap();
      await store.appendTranscript(sessionIdentifier, finalized);
      await store.appendTranscript(sessionIdentifier, buildPartial(SEGMENT_ID_2));

      const bundleResult = await store.loadExportBundle(sessionIdentifier);
      expect(bundleResult.isOk()).toBe(true);
      if (bundleResult.isOk()) {
        expect(bundleResult.value.stream.segments.size).toBe(2);
        const finalSegment = bundleResult.value.stream.segments.get(SEGMENT_ID_1);
        expect(finalSegment?.isFinal).toBe(true);
      }
    });
  });

  describe('appendTranslation', () => {
    it('stores completed translations and returns them in the bundle', async () => {
      await store.saveSession(buildSession());
      await store.appendTranscript(sessionIdentifier, buildPartial(SEGMENT_ID_1));
      await store.appendTranslation(sessionIdentifier, buildCompletedTranslation());

      const bundleResult = await store.loadExportBundle(sessionIdentifier);
      expect(bundleResult.isOk()).toBe(true);
      if (bundleResult.isOk()) {
        const translation = bundleResult.value.stream.translations.get(SEGMENT_ID_1);
        expect(translation?.status).toBe('completed');
        if (translation?.status === 'completed') {
          expect(translation.text).toBe('こんにちは');
        }
      }
    });

    it('stores failed translations (empty text)', async () => {
      await store.saveSession(buildSession());
      const failed = createFailedTranslationSegment({
        translationIdentifier: TRANSLATION_ID,
        segmentIdentifier: SEGMENT_ID_1,
        targetLanguage: 'ja-JP',
      })._unsafeUnwrap();
      await store.appendTranslation(sessionIdentifier, failed);

      const bundleResult = await store.loadExportBundle(sessionIdentifier);
      expect(bundleResult.isOk()).toBe(true);
      if (bundleResult.isOk()) {
        const translation = bundleResult.value.stream.translations.get(SEGMENT_ID_1);
        expect(translation?.status).toBe('failed');
      }
    });
  });

  describe('loadExportBundle', () => {
    it('returns notFoundError when session does not exist', async () => {
      const result = await store.loadExportBundle(sessionIdentifier);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.kind).toBe('not-found');
    });

    it('isolates segments per sessionId via the sessionId index', async () => {
      const OTHER_SESSION = '01HZX8Y1R8M7D3Q2P4T5V6W7A9';
      const otherSessionId = parseSessionIdentifier(OTHER_SESSION)._unsafeUnwrap();

      await store.saveSession(buildSession());
      await store.saveSession(
        createSourceSession({
          sessionIdentifier: OTHER_SESSION,
          sourceIdentifier: '01HZX8Y1R8M7D3Q2P4T5V6W7B2',
          sourceType: 'microphone',
          languagePair: createLanguagePair({
            source: 'en-US',
            target: 'ja-JP',
          })._unsafeUnwrap(),
          startedAt: '2026-04-21T00:01:00.000Z',
        })._unsafeUnwrap(),
      );
      await store.appendTranscript(sessionIdentifier, buildPartial(SEGMENT_ID_1));
      await store.appendTranscript(otherSessionId, buildPartial(SEGMENT_ID_2));

      const a = await store.loadExportBundle(sessionIdentifier);
      const b = await store.loadExportBundle(otherSessionId);
      expect(a.isOk() && a.value.stream.segments.size).toBe(1);
      expect(b.isOk() && b.value.stream.segments.size).toBe(1);
      if (a.isOk()) {
        expect(a.value.stream.segments.has(SEGMENT_ID_1)).toBe(true);
        expect(a.value.stream.segments.has(SEGMENT_ID_2)).toBe(false);
      }
    });
  });
});
