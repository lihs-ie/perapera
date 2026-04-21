import { describe, expect, it } from 'vitest';
import { createRelaySession } from '../../domain/session/relay-session';
import {
  parseSessionIdentifier,
  type SessionIdentifier,
} from '../../domain/session/session-identifier';
import { createInMemoryRelaySessionRepository } from './in-memory-relay-session-repository';

const ID_A = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const ID_B = '01HZX8Y1R8M7D3Q2P4T5V6W7A2';

const buildSession = (sessionId: string) =>
  createRelaySession({
    sessionIdentifier: sessionId,
    streamTokenIdentifier: 'strm_' + sessionId,
    sourceType: 'tab',
    displayName: 'Tab',
    sourceLanguage: 'en-US',
    autoDetectLanguage: false,
    targetLanguage: 'ja-JP',
    overlayTarget: { kind: 'tab', tabId: 1 },
    client: { extensionVersion: '0.1.0', protocolVersion: '1.0' },
    createdAt: '2026-04-21T00:00:00.000Z',
    expiresAt: '2026-04-21T01:00:00.000Z',
  })._unsafeUnwrap();

describe('createInMemoryRelaySessionRepository', () => {
  const identifierA: SessionIdentifier = parseSessionIdentifier(ID_A)._unsafeUnwrap();
  const identifierB: SessionIdentifier = parseSessionIdentifier(ID_B)._unsafeUnwrap();

  it('save then find returns the stored session', async () => {
    const repo = createInMemoryRelaySessionRepository();
    const session = buildSession(ID_A);
    await repo.save(session);
    const result = await repo.find(identifierA);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value).toEqual(session);
  });

  it('find returns null for unknown identifiers', async () => {
    const repo = createInMemoryRelaySessionRepository();
    const result = await repo.find(identifierA);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value).toBeNull();
  });

  it('save overwrites an existing session for the same identifier', async () => {
    const repo = createInMemoryRelaySessionRepository();
    const first = buildSession(ID_A);
    await repo.save(first);
    const next = { ...first, displayName: 'Renamed' };
    await repo.save(next);
    const result = await repo.find(identifierA);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value?.displayName).toBe('Renamed');
  });

  it('delete removes the session', async () => {
    const repo = createInMemoryRelaySessionRepository();
    await repo.save(buildSession(ID_A));
    await repo.delete(identifierA);
    const result = await repo.find(identifierA);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value).toBeNull();
  });

  it('isolates sessions by identifier', async () => {
    const repo = createInMemoryRelaySessionRepository();
    await repo.save(buildSession(ID_A));
    await repo.save(buildSession(ID_B));
    const a = await repo.find(identifierA);
    const b = await repo.find(identifierB);
    expect(a.isOk() && a.value !== null).toBe(true);
    expect(b.isOk() && b.value !== null).toBe(true);
  });
});
