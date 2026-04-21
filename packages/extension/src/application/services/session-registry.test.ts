import { describe, expect, it } from 'vitest';
import {
  createSourceSession,
  startSourceSession,
  stopSourceSession,
  transitionSourceSessionState,
  type SourceSession,
} from '../../domain/session/source-session';
import {
  parseSessionIdentifier,
  type SessionIdentifier,
} from '../../domain/session/session-identifier';
import { createLanguagePair, type LanguagePair } from '../../domain/session/language-pair';
import { createSessionRegistry } from './session-registry';

const ID_1 = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const ID_2 = '01HZX8Y1R8M7D3Q2P4T5V6W7A2';
const SOURCE_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7B1';
const identifier1: SessionIdentifier = parseSessionIdentifier(ID_1)._unsafeUnwrap();

const LANGUAGE_PAIR: LanguagePair = createLanguagePair({
  source: 'en-US',
  target: 'ja-JP',
})._unsafeUnwrap();

const buildSession = (sessionIdentifier: string, state?: SourceSession['state']): SourceSession => {
  const session = createSourceSession({
    sessionIdentifier,
    sourceIdentifier: SOURCE_ID,
    sourceType: 'microphone',
    languagePair: LANGUAGE_PAIR,
    startedAt: '2026-04-21T00:00:00.000Z',
  })._unsafeUnwrap();
  if (state === undefined || state === 'idle') return session;
  if (state === 'stopped') {
    return startSourceSession(session)
      .andThen((s) => transitionSourceSessionState(s, 'connecting'))
      .andThen((s) => transitionSourceSessionState(s, 'capturing'))
      .andThen((s) => stopSourceSession(s, { stoppedAt: '2026-04-21T00:01:00.000Z' }))
      ._unsafeUnwrap();
  }
  const started = startSourceSession(session)._unsafeUnwrap();
  if (state === 'requesting_permission') return started;
  return transitionSourceSessionState(started, state)._unsafeUnwrap();
};

describe('createSessionRegistry (IMPL-342)', () => {
  it('find returns undefined for unknown sessionIdentifier', () => {
    const registry = createSessionRegistry();
    expect(registry.find(identifier1)).toBeUndefined();
  });

  it('save stores a session retrievable by identifier', () => {
    const registry = createSessionRegistry();
    const session = buildSession(ID_1);
    registry.save(session);
    expect(registry.find(identifier1)).toEqual(session);
  });

  it('save overwrites the session for the same identifier', () => {
    const registry = createSessionRegistry();
    const initial = buildSession(ID_1);
    registry.save(initial);
    const next = buildSession(ID_1, 'connecting');
    registry.save(next);
    expect(registry.find(identifier1)?.state).toBe('connecting');
  });

  it('delete removes the session', () => {
    const registry = createSessionRegistry();
    registry.save(buildSession(ID_1));
    registry.delete(identifier1);
    expect(registry.find(identifier1)).toBeUndefined();
  });

  it('delete is a no-op for unknown identifiers', () => {
    const registry = createSessionRegistry();
    expect(() => {
      registry.delete(identifier1);
    }).not.toThrow();
  });

  it('findActive returns only non-stopped sessions', () => {
    const registry = createSessionRegistry();
    const idle = buildSession(ID_1, 'idle');
    const stopped = buildSession(ID_2, 'stopped');
    registry.save(idle);
    registry.save(stopped);
    const active = registry.findActive();
    expect(active).toHaveLength(1);
    expect(active[0]?.sessionIdentifier).toBe(identifier1);
  });

  it('listAll returns every registered session regardless of state', () => {
    const registry = createSessionRegistry();
    registry.save(buildSession(ID_1, 'idle'));
    registry.save(buildSession(ID_2, 'stopped'));
    expect(registry.listAll()).toHaveLength(2);
  });

  it('clear removes every session', () => {
    const registry = createSessionRegistry();
    registry.save(buildSession(ID_1));
    registry.save(buildSession(ID_2));
    registry.clear();
    expect(registry.listAll()).toHaveLength(0);
  });
});
