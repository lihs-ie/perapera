import { errAsync, okAsync } from 'neverthrow';
import { describe, expect, it } from 'vitest';
import { createLanguagePair } from '../session/language-pair';
import { parseSessionIdentifier, type SessionIdentifier } from '../session/session-identifier';
import { createSourceSession, type SourceSession } from '../session/source-session';
import { notFoundError, type DomainError } from '../shared/errors';
import { type SourceSessionRepository } from './source-session-repository';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const SESSION_ID_2 = '01HZX8Y1R8M7D3Q2P4T5V6W7A2';
const SOURCE_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7B1';
const SOURCE_ID_2 = '01HZX8Y1R8M7D3Q2P4T5V6W7B2';

const sessionIdentifier: SessionIdentifier = parseSessionIdentifier(SESSION_ID)._unsafeUnwrap();
const languagePair = createLanguagePair({ source: 'en-US', target: 'ja-JP' })._unsafeUnwrap();

const buildSession = (sessionId: string, sourceId: string): SourceSession =>
  createSourceSession({
    sessionIdentifier: sessionId,
    sourceIdentifier: sourceId,
    sourceType: 'tab',
    languagePair,
    startedAt: '2026-04-21T00:00:00.000Z',
  })._unsafeUnwrap();

describe('SourceSessionRepository (DD-260)', () => {
  describe('type contract', () => {
    it('accepts an object literal that implements findById, findActiveSessions, and save', () => {
      const mock: SourceSessionRepository = {
        findById: () => okAsync(buildSession(SESSION_ID, SOURCE_ID)),
        findActiveSessions: () => okAsync([]),
        findAllSessions: () => okAsync([]),
        save: () => okAsync(undefined),
      };
      expect(typeof mock.findById).toBe('function');
      expect(typeof mock.findActiveSessions).toBe('function');
      expect(typeof mock.save).toBe('function');
    });
  });

  describe('findById', () => {
    it('returns the matching SourceSession on the success path', async () => {
      const session = buildSession(SESSION_ID, SOURCE_ID);
      const mock: SourceSessionRepository = {
        findById: () => okAsync(session),
        findActiveSessions: () => okAsync([]),
        findAllSessions: () => okAsync([]),
        save: () => okAsync(undefined),
      };
      const result = await mock.findById(sessionIdentifier);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value).toBe(session);
    });

    it('returns notFoundError when the session does not exist', async () => {
      const mock: SourceSessionRepository = {
        findById: (id) =>
          errAsync<SourceSession, DomainError>(
            notFoundError({ resourceType: 'SourceSession', identifier: id }),
          ),
        findActiveSessions: () => okAsync([]),
        findAllSessions: () => okAsync([]),
        save: () => okAsync(undefined),
      };
      const result = await mock.findById(sessionIdentifier);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.kind).toBe('not-found');
        if (result.error.kind === 'not-found') {
          expect(result.error.resourceType).toBe('SourceSession');
          expect(result.error.identifier).toBe(SESSION_ID);
        }
      }
    });
  });

  describe('findActiveSessions', () => {
    it('returns an empty readonly array when no sessions are active (ok([]), not an error)', async () => {
      const mock: SourceSessionRepository = {
        findById: () => okAsync(buildSession(SESSION_ID, SOURCE_ID)),
        findActiveSessions: () => okAsync([]),
        findAllSessions: () => okAsync([]),
        save: () => okAsync(undefined),
      };
      const result = await mock.findActiveSessions();
      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value).toEqual([]);
    });

    it('returns all active sessions (multiple entries allowed)', async () => {
      const sessions: readonly SourceSession[] = [
        buildSession(SESSION_ID, SOURCE_ID),
        buildSession(SESSION_ID_2, SOURCE_ID_2),
      ];
      const mock: SourceSessionRepository = {
        findById: () => okAsync(sessions[0]!),
        findActiveSessions: () => okAsync(sessions),
        findAllSessions: () => okAsync(sessions),
        save: () => okAsync(undefined),
      };
      const result = await mock.findActiveSessions();
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(2);
        expect(result.value[0]?.sessionIdentifier).toBe(SESSION_ID);
        expect(result.value[1]?.sessionIdentifier).toBe(SESSION_ID_2);
      }
    });
  });

  describe('save', () => {
    it('resolves to ok(void) on the success path (upsert for create and update)', async () => {
      const mock: SourceSessionRepository = {
        findById: () => okAsync(buildSession(SESSION_ID, SOURCE_ID)),
        findActiveSessions: () => okAsync([]),
        findAllSessions: () => okAsync([]),
        save: () => okAsync(undefined),
      };
      const result = await mock.save(buildSession(SESSION_ID, SOURCE_ID));
      expect(result.isOk()).toBe(true);
    });
  });
});
