import { errAsync, okAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import { type SourceSessionRepository } from '../../domain/repositories/source-session-repository';
import { createLanguagePair } from '../../domain/session/language-pair';
import { createSourceSession, type SourceSession } from '../../domain/session/source-session';
import { invariantViolationError, type DomainError } from '../../domain/shared/errors';
import { createOrphanSessionCleanupService } from './orphan-session-cleanup-service';

const STARTED_AT = '2026-04-22T00:00:00.000Z';
const CLEANUP_AT = '2026-04-22T00:10:00.000Z';

const buildSession = (
  sessionId: string,
  sourceId: string,
  state: SourceSession['state'],
): SourceSession => {
  const base = createSourceSession({
    sessionIdentifier: sessionId,
    sourceIdentifier: sourceId,
    sourceType: 'tab',
    languagePair: createLanguagePair({ source: 'en-US', target: 'ja-JP' })._unsafeUnwrap(),
    startedAt: STARTED_AT,
  })._unsafeUnwrap();
  return { ...base, state };
};

const SESSION_IDS = [
  '01HZX8Y1R8M7D3Q2P4T5V6W7A1',
  '01HZX8Y1R8M7D3Q2P4T5V6W7A2',
  '01HZX8Y1R8M7D3Q2P4T5V6W7A3',
] as const;
const SOURCE_IDS = [
  '01HZX8Y1R8M7D3Q2P4T5V6W7B1',
  '01HZX8Y1R8M7D3Q2P4T5V6W7B2',
  '01HZX8Y1R8M7D3Q2P4T5V6W7B3',
] as const;

const buildRepository = (
  sessions: readonly SourceSession[],
  overrides: Partial<SourceSessionRepository> = {},
): SourceSessionRepository => ({
  findById: vi.fn(() =>
    errAsync<SourceSession, DomainError>(
      invariantViolationError({ invariant: 'unused', details: 'unused' }),
    ),
  ),
  findActiveSessions: vi.fn(() => okAsync(sessions)),
  findAllSessions: vi.fn(() => okAsync(sessions)),
  save: vi.fn(() => okAsync(undefined)),
  ...overrides,
});

describe('createOrphanSessionCleanupService (IMPL-603)', () => {
  it('transitions all active non-terminal sessions to stopped state', async () => {
    const sessions = [
      buildSession(SESSION_IDS[0], SOURCE_IDS[0], 'capturing'),
      buildSession(SESSION_IDS[1], SOURCE_IDS[1], 'transcribing'),
      buildSession(SESSION_IDS[2], SOURCE_IDS[2], 'translating'),
    ];
    const repository = buildRepository(sessions);
    const service = createOrphanSessionCleanupService({
      sourceSessionRepository: repository,
      clock: () => CLEANUP_AT,
    });

    const result = await service.cleanup();

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.recoveredCount).toBe(3);
    }
    expect(repository.save).toHaveBeenCalledTimes(3);
    const saveMock = vi.mocked(repository.save);
    for (const call of saveMock.mock.calls) {
      expect(call[0].state).toBe('stopped');
      expect(call[0].stoppedAt).toBe(CLEANUP_AT);
    }
  });

  it('returns recoveredCount 0 when there are no active sessions', async () => {
    const repository = buildRepository([]);
    const service = createOrphanSessionCleanupService({
      sourceSessionRepository: repository,
      clock: () => CLEANUP_AT,
    });

    const result = await service.cleanup();

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.recoveredCount).toBe(0);
    }
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('skips sessions already in error state (keeps the failure indication)', async () => {
    const sessions = [
      buildSession(SESSION_IDS[0], SOURCE_IDS[0], 'capturing'),
      buildSession(SESSION_IDS[1], SOURCE_IDS[1], 'error'),
    ];
    const repository = buildRepository(sessions);
    const service = createOrphanSessionCleanupService({
      sourceSessionRepository: repository,
      clock: () => CLEANUP_AT,
    });

    const result = await service.cleanup();

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.recoveredCount).toBe(1);
    }
    expect(repository.save).toHaveBeenCalledTimes(1);
    const saveMock = vi.mocked(repository.save);
    expect(saveMock.mock.calls[0]?.[0].sessionIdentifier).toBe(SESSION_IDS[0]);
  });

  it('cleans up idle sessions too (stopped is reachable from any non-terminal state)', async () => {
    const sessions = [
      buildSession(SESSION_IDS[0], SOURCE_IDS[0], 'capturing'),
      buildSession(SESSION_IDS[1], SOURCE_IDS[1], 'idle'),
    ];
    const repository = buildRepository(sessions);
    const service = createOrphanSessionCleanupService({
      sourceSessionRepository: repository,
      clock: () => CLEANUP_AT,
    });

    const result = await service.cleanup();

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.recoveredCount).toBe(2);
    }
    expect(repository.save).toHaveBeenCalledTimes(2);
  });

  it('continues with other sessions when one save fails (fire-and-forget per session)', async () => {
    const logWarn = vi.fn();
    const sessions = [
      buildSession(SESSION_IDS[0], SOURCE_IDS[0], 'capturing'),
      buildSession(SESSION_IDS[1], SOURCE_IDS[1], 'transcribing'),
    ];
    let callCount = 0;
    const repository = buildRepository(sessions, {
      save: vi.fn(() => {
        callCount += 1;
        if (callCount === 1) {
          return errAsync<void, DomainError>(
            invariantViolationError({ invariant: 'storage-write-failed', details: 'quota' }),
          );
        }
        return okAsync<void, DomainError>(undefined);
      }),
    });
    const service = createOrphanSessionCleanupService({
      sourceSessionRepository: repository,
      clock: () => CLEANUP_AT,
      logWarn,
    });

    const result = await service.cleanup();

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.recoveredCount).toBe(1);
    }
    expect(repository.save).toHaveBeenCalledTimes(2);
    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('storage-write-failed'));
  });

  it('propagates findActiveSessions failure as the cleanup error', async () => {
    const repository = buildRepository([], {
      findActiveSessions: vi.fn(() =>
        errAsync<readonly SourceSession[], DomainError>(
          invariantViolationError({ invariant: 'storage-read-integrity', details: 'db corrupt' }),
        ),
      ),
    });
    const service = createOrphanSessionCleanupService({
      sourceSessionRepository: repository,
      clock: () => CLEANUP_AT,
    });

    const result = await service.cleanup();

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.kind).toBe('invariant-violation');
    }
    expect(repository.save).not.toHaveBeenCalled();
  });
});
