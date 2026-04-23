import { describe, expect, it } from 'vitest';
import { createEndpointingPolicy, DEFAULT_ENDPOINTING_POLICY } from './endpointing-policy';
import { createLanguagePair } from './language-pair';
import {
  createSourceSession,
  markSourceSessionDegraded,
  pauseSourceSession,
  recoverSourceSessionTranslation,
  resumeSourceSession,
  startSourceSession,
  stopSourceSession,
  transitionSourceSessionState,
  updateSourceSessionEndpointing,
  updateSourceSessionTranslationContext,
} from './source-session';
import {
  createTranslationContextWindow,
  DEFAULT_TRANSLATION_CONTEXT_WINDOW,
} from './translation-context-window';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7X8';
const SOURCE_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7X9';
const startedAt = '2026-04-21T00:00:00.000Z';
const languagePair = createLanguagePair({ source: 'en-US', target: 'ja-JP' })._unsafeUnwrap();

const newSession = () =>
  createSourceSession({
    sessionIdentifier: SESSION_ID,
    sourceIdentifier: SOURCE_ID,
    sourceType: 'tab',
    languagePair,
    startedAt,
  })._unsafeUnwrap();

describe('SourceSession aggregate', () => {
  describe('createSourceSession', () => {
    it('creates a session in idle state', () => {
      const result = createSourceSession({
        sessionIdentifier: SESSION_ID,
        sourceIdentifier: SOURCE_ID,
        sourceType: 'tab',
        languagePair,
        startedAt,
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.state).toBe('idle');
        expect(result.value.stoppedAt).toBeNull();
        expect(result.value.degradedReason).toBeNull();
      }
    });

    it('rejects invalid identifiers', () => {
      const result = createSourceSession({
        sessionIdentifier: 'bad',
        sourceIdentifier: SOURCE_ID,
        sourceType: 'tab',
        languagePair,
        startedAt,
      });
      expect(result.isErr()).toBe(true);
    });

    it('rejects invalid sourceType', () => {
      const result = createSourceSession({
        sessionIdentifier: SESSION_ID,
        sourceIdentifier: SOURCE_ID,
        sourceType: 'unknown',
        languagePair,
        startedAt,
      });
      expect(result.isErr()).toBe(true);
    });

    it('rejects invalid startedAt', () => {
      const result = createSourceSession({
        sessionIdentifier: SESSION_ID,
        sourceIdentifier: SOURCE_ID,
        sourceType: 'tab',
        languagePair,
        startedAt: 'not-a-date',
      });
      expect(result.isErr()).toBe(true);
    });
  });

  describe('startSourceSession', () => {
    it('transitions idle → requesting_permission', () => {
      const result = startSourceSession(newSession());
      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value.state).toBe('requesting_permission');
    });

    it('rejects start on non-idle state', () => {
      const started = startSourceSession(newSession())._unsafeUnwrap();
      const result = startSourceSession(started);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.kind).toBe('session-state-transition');
    });
  });

  describe('transitionSourceSessionState', () => {
    it('permits requesting_permission → connecting', () => {
      const started = startSourceSession(newSession())._unsafeUnwrap();
      const result = transitionSourceSessionState(started, 'connecting');
      expect(result.isOk()).toBe(true);
    });

    it('permits connecting → capturing', () => {
      const s = transitionSourceSessionState(
        startSourceSession(newSession())._unsafeUnwrap(),
        'connecting',
      )._unsafeUnwrap();
      const result = transitionSourceSessionState(s, 'capturing');
      expect(result.isOk()).toBe(true);
    });

    it('permits capturing → transcribing → translating → transcribing cycle', () => {
      let session = newSession();
      session = startSourceSession(session)._unsafeUnwrap();
      session = transitionSourceSessionState(session, 'connecting')._unsafeUnwrap();
      session = transitionSourceSessionState(session, 'capturing')._unsafeUnwrap();
      session = transitionSourceSessionState(session, 'transcribing')._unsafeUnwrap();
      session = transitionSourceSessionState(session, 'translating')._unsafeUnwrap();
      session = transitionSourceSessionState(session, 'transcribing')._unsafeUnwrap();
      expect(session.state).toBe('transcribing');
    });

    it('rejects illegal transition idle → capturing', () => {
      const result = transitionSourceSessionState(newSession(), 'capturing');
      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.kind).toBe('session-state-transition');
    });

    it('permits reconnecting → capturing', () => {
      let session = newSession();
      session = startSourceSession(session)._unsafeUnwrap();
      session = transitionSourceSessionState(session, 'connecting')._unsafeUnwrap();
      session = transitionSourceSessionState(session, 'capturing')._unsafeUnwrap();
      session = transitionSourceSessionState(session, 'reconnecting')._unsafeUnwrap();
      const result = transitionSourceSessionState(session, 'capturing');
      expect(result.isOk()).toBe(true);
    });
  });

  describe('pauseSourceSession / resumeSourceSession', () => {
    it('pauses from capturing', () => {
      let session = newSession();
      session = startSourceSession(session)._unsafeUnwrap();
      session = transitionSourceSessionState(session, 'connecting')._unsafeUnwrap();
      session = transitionSourceSessionState(session, 'capturing')._unsafeUnwrap();
      const paused = pauseSourceSession(session);
      expect(paused.isOk()).toBe(true);
      if (paused.isOk()) expect(paused.value.state).toBe('paused');
    });

    it('rejects pause from idle', () => {
      const result = pauseSourceSession(newSession());
      expect(result.isErr()).toBe(true);
    });

    it('resume from paused → capturing', () => {
      let session = newSession();
      session = startSourceSession(session)._unsafeUnwrap();
      session = transitionSourceSessionState(session, 'connecting')._unsafeUnwrap();
      session = transitionSourceSessionState(session, 'capturing')._unsafeUnwrap();
      session = pauseSourceSession(session)._unsafeUnwrap();
      const resumed = resumeSourceSession(session);
      expect(resumed.isOk()).toBe(true);
      if (resumed.isOk()) expect(resumed.value.state).toBe('capturing');
    });

    it('rejects resume on non-paused state', () => {
      const result = resumeSourceSession(newSession());
      expect(result.isErr()).toBe(true);
    });
  });

  describe('markSourceSessionDegraded', () => {
    it('transitions transcribing → degraded with reason', () => {
      let session = newSession();
      session = startSourceSession(session)._unsafeUnwrap();
      session = transitionSourceSessionState(session, 'connecting')._unsafeUnwrap();
      session = transitionSourceSessionState(session, 'capturing')._unsafeUnwrap();
      session = transitionSourceSessionState(session, 'transcribing')._unsafeUnwrap();
      const result = markSourceSessionDegraded(session, 'translation provider timed out');
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.state).toBe('degraded');
        expect(result.value.degradedReason).toBe('translation provider timed out');
      }
    });

    it('rejects degraded from idle (invariant: translation-failure-only)', () => {
      const result = markSourceSessionDegraded(newSession(), 'reason');
      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.kind).toBe('session-state-transition');
    });

    it('recovers from degraded → transcribing', () => {
      let session = newSession();
      session = startSourceSession(session)._unsafeUnwrap();
      session = transitionSourceSessionState(session, 'connecting')._unsafeUnwrap();
      session = transitionSourceSessionState(session, 'capturing')._unsafeUnwrap();
      session = transitionSourceSessionState(session, 'transcribing')._unsafeUnwrap();
      session = markSourceSessionDegraded(session, 'temp error')._unsafeUnwrap();
      const recovered = recoverSourceSessionTranslation(session);
      expect(recovered.isOk()).toBe(true);
      if (recovered.isOk()) {
        expect(recovered.value.state).toBe('transcribing');
        expect(recovered.value.degradedReason).toBeNull();
      }
    });
  });

  describe('stopSourceSession', () => {
    it('transitions to stopped and records timestamp', () => {
      let session = newSession();
      session = startSourceSession(session)._unsafeUnwrap();
      const result = stopSourceSession(session, {
        stoppedAt: '2026-04-21T00:10:00.000Z',
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.state).toBe('stopped');
        expect(result.value.stoppedAt).toBe('2026-04-21T00:10:00.000Z');
      }
    });

    it('rejects resume after stopped (DD-210 invariant 4)', () => {
      let session = newSession();
      session = startSourceSession(session)._unsafeUnwrap();
      session = stopSourceSession(session, {
        stoppedAt: '2026-04-21T00:10:00.000Z',
      })._unsafeUnwrap();
      const resumed = resumeSourceSession(session);
      expect(resumed.isErr()).toBe(true);
    });

    it('rejects any transition after stopped', () => {
      let session = newSession();
      session = startSourceSession(session)._unsafeUnwrap();
      session = stopSourceSession(session, {
        stoppedAt: '2026-04-21T00:10:00.000Z',
      })._unsafeUnwrap();
      expect(transitionSourceSessionState(session, 'capturing').isErr()).toBe(true);
    });
  });

  describe('endpointing / translationContext (DD-210 invariant 5)', () => {
    it('defaults to DEFAULT_ENDPOINTING_POLICY and DEFAULT_TRANSLATION_CONTEXT_WINDOW when omitted', () => {
      const session = newSession();
      expect(session.endpointing).toBe(DEFAULT_ENDPOINTING_POLICY);
      expect(session.translationContext).toBe(DEFAULT_TRANSLATION_CONTEXT_WINDOW);
    });

    it('accepts overrides at creation time', () => {
      const endpointing = createEndpointingPolicy({
        silenceThresholdMs: 900,
        punctuationAware: false,
        minUtteranceMs: 700,
      })._unsafeUnwrap();
      const translationContext = createTranslationContextWindow({
        maxSegments: 5,
        includeTranslatedText: false,
      })._unsafeUnwrap();
      const result = createSourceSession({
        sessionIdentifier: SESSION_ID,
        sourceIdentifier: SOURCE_ID,
        sourceType: 'tab',
        languagePair,
        startedAt,
        endpointing,
        translationContext,
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.endpointing).toBe(endpointing);
        expect(result.value.translationContext).toBe(translationContext);
      }
    });

    it('updateSourceSessionEndpointing replaces policy before stop', () => {
      const session = newSession();
      const next = createEndpointingPolicy({
        silenceThresholdMs: 1000,
        punctuationAware: true,
        minUtteranceMs: 500,
      })._unsafeUnwrap();
      const result = updateSourceSessionEndpointing(session, next);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value.endpointing).toBe(next);
    });

    it('updateSourceSessionTranslationContext replaces window before stop', () => {
      const session = newSession();
      const next = createTranslationContextWindow({
        maxSegments: 0,
        includeTranslatedText: false,
      })._unsafeUnwrap();
      const result = updateSourceSessionTranslationContext(session, next);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value.translationContext).toBe(next);
    });

    it('rejects endpointing update after session stopped', () => {
      let session = newSession();
      session = startSourceSession(session)._unsafeUnwrap();
      session = stopSourceSession(session, {
        stoppedAt: '2026-04-21T00:10:00.000Z',
      })._unsafeUnwrap();
      const next = createEndpointingPolicy({
        silenceThresholdMs: 1000,
        punctuationAware: true,
        minUtteranceMs: 500,
      })._unsafeUnwrap();
      const result = updateSourceSessionEndpointing(session, next);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.kind).toBe('session-state-transition');
    });

    it('rejects translationContext update after session stopped', () => {
      let session = newSession();
      session = startSourceSession(session)._unsafeUnwrap();
      session = stopSourceSession(session, {
        stoppedAt: '2026-04-21T00:10:00.000Z',
      })._unsafeUnwrap();
      const next = createTranslationContextWindow({
        maxSegments: 1,
        includeTranslatedText: true,
      })._unsafeUnwrap();
      const result = updateSourceSessionTranslationContext(session, next);
      expect(result.isErr()).toBe(true);
    });
  });
});
