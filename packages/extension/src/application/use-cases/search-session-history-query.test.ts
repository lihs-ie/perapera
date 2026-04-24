import { okAsync } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type TranscriptSearchMatch,
  type TranscriptStreamRepository,
} from '../../domain/repositories/transcript-stream-repository';
import {
  parseSessionIdentifier,
  type SessionIdentifier,
} from '../../domain/session/session-identifier';
import { type DomainError } from '../../domain/shared/errors';
import { createSearchSessionHistoryQuery } from './search-session-history-query';

const SESSION_A = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const SESSION_B = '01HZX8Y1R8M7D3Q2P4T5V6W7B1';

const buildRepo = (matches: readonly TranscriptSearchMatch[]): TranscriptStreamRepository => ({
  findBySessionId: vi.fn(),
  appendPartial: vi.fn(),
  appendFinal: vi.fn(),
  appendTranslation: vi.fn(),
  search: vi.fn(() => okAsync<readonly TranscriptSearchMatch[], DomainError>(matches)),
});

const matchFor = (
  session: SessionIdentifier,
  segmentId: string,
  matchedLanguage: 'source' | 'target',
  startTimeMs: number,
): TranscriptSearchMatch => ({
  sessionIdentifier: session,
  segmentIdentifier: segmentId,
  snippet: '…hello world…',
  matchedLanguage,
  startTimeMs,
});

describe('createSearchSessionHistoryQuery (IMPL-218, DD-261, Issue #125)', () => {
  const sessionA: SessionIdentifier = parseSessionIdentifier(SESSION_A)._unsafeUnwrap();
  const sessionB: SessionIdentifier = parseSessionIdentifier(SESSION_B)._unsafeUnwrap();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns matches grouped by session', async () => {
    const repo = buildRepo([
      matchFor(sessionA, 'seg-a1', 'source', 1000),
      matchFor(sessionA, 'seg-a2', 'source', 2000),
      matchFor(sessionB, 'seg-b1', 'target', 3000),
    ]);
    const query = createSearchSessionHistoryQuery({ transcriptStreamRepository: repo });
    const result = await query({ keyword: 'hello', language: 'both', caseSensitive: false });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const sessions = result.value.sessions;
      expect(sessions).toHaveLength(2);
      const groupA = sessions.find((s) => s.sessionIdentifier === SESSION_A);
      expect(groupA?.matches).toHaveLength(2);
      const groupB = sessions.find((s) => s.sessionIdentifier === SESSION_B);
      expect(groupB?.matches).toHaveLength(1);
    }
  });

  it('limits each session to 5 matches maximum', async () => {
    const matches: TranscriptSearchMatch[] = Array.from({ length: 10 }, (_, i) =>
      matchFor(sessionA, `seg-${String(i)}`, 'source', 1000 * (i + 1)),
    );
    const repo = buildRepo(matches);
    const query = createSearchSessionHistoryQuery({ transcriptStreamRepository: repo });
    const result = await query({ keyword: 'x', language: 'source', caseSensitive: false });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const groupA = result.value.sessions[0];
      expect(groupA?.matches).toHaveLength(5);
    }
  });

  it('returns empty sessions when no matches', async () => {
    const repo = buildRepo([]);
    const query = createSearchSessionHistoryQuery({ transcriptStreamRepository: repo });
    const result = await query({ keyword: 'nothing', language: 'both', caseSensitive: false });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value.sessions).toHaveLength(0);
  });

  it('rejects invalid keyword', async () => {
    const repo = buildRepo([]);
    const query = createSearchSessionHistoryQuery({ transcriptStreamRepository: repo });
    const result = await query({ keyword: '', language: 'both', caseSensitive: false });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.type).toBe('validation');
  });

  it('sorts session matches by startTimeMs ascending within group', async () => {
    const repo = buildRepo([
      matchFor(sessionA, 'seg-late', 'source', 5000),
      matchFor(sessionA, 'seg-early', 'source', 1000),
    ]);
    const query = createSearchSessionHistoryQuery({ transcriptStreamRepository: repo });
    const result = await query({ keyword: 'x', language: 'source', caseSensitive: false });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const groupA = result.value.sessions[0];
      expect(groupA?.matches[0]?.startTimeMs).toBe(1000);
      expect(groupA?.matches[1]?.startTimeMs).toBe(5000);
    }
  });
});
