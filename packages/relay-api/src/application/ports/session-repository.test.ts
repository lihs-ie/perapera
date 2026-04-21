import { okAsync } from 'neverthrow';
import { describe, expect, it } from 'vitest';
import {
  createRelaySession,
  type CreateRelaySessionParams,
} from '../../domain/session/relay-session';
import {
  parseSessionIdentifier,
  type SessionIdentifier,
} from '../../domain/session/session-identifier';
import { type DomainError } from '../../domain/shared/errors';
import { type RelaySessionRepository } from './session-repository';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const sessionIdentifier: SessionIdentifier = parseSessionIdentifier(SESSION_ID)._unsafeUnwrap();

const buildSession = () =>
  createRelaySession({
    sessionIdentifier: SESSION_ID,
    streamTokenIdentifier: 'strm_01HZX8Y1R8M7D3Q2P4T5V6W7A2',
    sourceType: 'tab',
    displayName: 'Tab',
    sourceLanguage: 'en-US',
    autoDetectLanguage: false,
    targetLanguage: 'ja-JP',
    overlayTarget: { kind: 'tab', tabId: 1 },
    client: { extensionVersion: '0.1.0', protocolVersion: '1.0' },
    createdAt: '2026-04-21T00:00:00.000Z',
    expiresAt: '2026-04-21T01:00:00.000Z',
  } satisfies CreateRelaySessionParams)._unsafeUnwrap();

describe('RelaySessionRepository port contract', () => {
  it('can be implemented with okAsync for all operations', async () => {
    const session = buildSession();
    const repo: RelaySessionRepository = {
      save: () => okAsync<void, DomainError>(undefined),
      find: () => okAsync<typeof session | null, DomainError>(session),
      delete: () => okAsync<void, DomainError>(undefined),
    };
    expect((await repo.save(session)).isOk()).toBe(true);
    expect((await repo.find(sessionIdentifier)).isOk()).toBe(true);
    expect((await repo.delete(sessionIdentifier)).isOk()).toBe(true);
  });

  it('find returns null for missing sessions', async () => {
    const repo: RelaySessionRepository = {
      save: () => okAsync<void, DomainError>(undefined),
      find: () => okAsync<null, DomainError>(null),
      delete: () => okAsync<void, DomainError>(undefined),
    };
    const result = await repo.find(sessionIdentifier);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value).toBeNull();
  });
});
