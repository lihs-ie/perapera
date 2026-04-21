import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLanguagePair } from '../../domain/session/language-pair';
import {
  createSourceSession,
  stopSourceSession,
  type SourceSession,
} from '../../domain/session/source-session';
import {
  parseSessionIdentifier,
  type SessionIdentifier,
} from '../../domain/session/session-identifier';
import { INDEXED_DB_NAME } from './open-perapera-db';
import {
  createIndexedDbSourceSessionRepository,
  type CloseableSourceSessionRepository,
} from './indexed-db-source-session-repository';

const SESSION_ID_A = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const SESSION_ID_B = '01HZX8Y1R8M7D3Q2P4T5V6W7A2';
const SESSION_ID_C = '01HZX8Y1R8M7D3Q2P4T5V6W7A3';
const SOURCE_ID_A = '01HZX8Y1R8M7D3Q2P4T5V6W7B1';
const SOURCE_ID_B = '01HZX8Y1R8M7D3Q2P4T5V6W7B2';
const SOURCE_ID_C = '01HZX8Y1R8M7D3Q2P4T5V6W7B3';

const identifierA: SessionIdentifier = parseSessionIdentifier(SESSION_ID_A)._unsafeUnwrap();
const identifierB: SessionIdentifier = parseSessionIdentifier(SESSION_ID_B)._unsafeUnwrap();
const identifierC: SessionIdentifier = parseSessionIdentifier(SESSION_ID_C)._unsafeUnwrap();

const buildSession = (
  sessionId: string,
  sourceId: string,
  startedAt = '2026-04-21T00:00:00.000Z',
): SourceSession =>
  createSourceSession({
    sessionIdentifier: sessionId,
    sourceIdentifier: sourceId,
    sourceType: 'tab',
    languagePair: createLanguagePair({ source: 'en-US', target: 'ja-JP' })._unsafeUnwrap(),
    startedAt,
  })._unsafeUnwrap();

const stoppedSession = (session: SourceSession): SourceSession =>
  stopSourceSession(session, { stoppedAt: '2026-04-21T00:10:00.000Z' })._unsafeUnwrap();

describe('createIndexedDbSourceSessionRepository (IMPL-140, DD-260)', () => {
  let repo: CloseableSourceSessionRepository;
  let databaseName: string;

  beforeEach(() => {
    databaseName = `${INDEXED_DB_NAME}-test-${String(Math.random()).slice(2)}`;
    repo = createIndexedDbSourceSessionRepository({ databaseName });
  });

  afterEach(async () => {
    await repo.close();
  });

  describe('save + findById', () => {
    it('persists a session and retrieves it by identifier', async () => {
      const saveResult = await repo.save(buildSession(SESSION_ID_A, SOURCE_ID_A));
      expect(saveResult.isOk()).toBe(true);

      const findResult = await repo.findById(identifierA);
      expect(findResult.isOk()).toBe(true);
      if (findResult.isOk()) {
        expect(findResult.value.sessionIdentifier).toBe(SESSION_ID_A);
        expect(findResult.value.sourceIdentifier).toBe(SOURCE_ID_A);
        expect(findResult.value.state).toBe('idle');
      }
    });

    it('upserts (save overwrites existing session)', async () => {
      const initial = buildSession(SESSION_ID_A, SOURCE_ID_A);
      await repo.save(initial);
      const updated = stoppedSession(initial);
      await repo.save(updated);

      const findResult = await repo.findById(identifierA);
      expect(findResult.isOk()).toBe(true);
      if (findResult.isOk()) {
        expect(findResult.value.state).toBe('stopped');
        expect(findResult.value.stoppedAt).toBe('2026-04-21T00:10:00.000Z');
      }
    });
  });

  describe('findById — missing', () => {
    it('returns notFound error when the session does not exist', async () => {
      const result = await repo.findById(identifierA);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.kind).toBe('not-found');
        if (result.error.kind === 'not-found') {
          expect(result.error.resourceType).toBe('SourceSession');
          expect(result.error.identifier).toBe(SESSION_ID_A);
        }
      }
    });
  });

  describe('findActiveSessions', () => {
    it('returns ok([]) when there are no sessions', async () => {
      const result = await repo.findActiveSessions();
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual([]);
      }
    });

    it('returns only non-stopped sessions', async () => {
      const active = buildSession(SESSION_ID_A, SOURCE_ID_A, '2026-04-21T00:00:00.000Z');
      const activeB = buildSession(SESSION_ID_B, SOURCE_ID_B, '2026-04-21T00:01:00.000Z');
      const stopped = stoppedSession(buildSession(SESSION_ID_C, SOURCE_ID_C));
      await repo.save(active);
      await repo.save(activeB);
      await repo.save(stopped);

      const result = await repo.findActiveSessions();
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const ids = result.value.map((session) => session.sessionIdentifier).sort();
        expect(ids).toEqual([SESSION_ID_A, SESSION_ID_B].sort());
      }
    });

    it('excludes a session once its state transitions to stopped', async () => {
      const session = buildSession(SESSION_ID_A, SOURCE_ID_A);
      await repo.save(session);
      const beforeStop = await repo.findActiveSessions();
      expect(beforeStop.isOk() && beforeStop.value.length).toBe(1);

      await repo.save(stoppedSession(session));
      const afterStop = await repo.findActiveSessions();
      expect(afterStop.isOk() && afterStop.value.length).toBe(0);
    });
  });

  it('does not leak sessions across database instances', async () => {
    await repo.save(buildSession(SESSION_ID_A, SOURCE_ID_A));

    const otherDatabase = `${INDEXED_DB_NAME}-test-${String(Math.random()).slice(2)}`;
    const otherRepo = createIndexedDbSourceSessionRepository({ databaseName: otherDatabase });
    const result = await otherRepo.findById(identifierA);
    expect(result.isErr()).toBe(true);
    await otherRepo.close();

    void identifierB;
    void identifierC;
  });
});
