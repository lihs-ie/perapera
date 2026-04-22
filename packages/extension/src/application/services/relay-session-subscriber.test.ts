import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import {
  parseSessionIdentifier,
  type SessionIdentifier,
} from '../../domain/session/session-identifier';
import { internalAppError, type ApplicationError } from '../errors/application-errors';
import {
  type RelayEvent,
  type RelayEventListener,
  type RelayGateway,
} from '../ports/relay-gateway';
import { createRelaySessionSubscriber, type RelayEventHandler } from './relay-session-subscriber';

const SESSION_A = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const SESSION_B = '01HZX8Y1R8M7D3Q2P4T5V6W7A2';
const identifierA: SessionIdentifier = parseSessionIdentifier(SESSION_A)._unsafeUnwrap();
const identifierB: SessionIdentifier = parseSessionIdentifier(SESSION_B)._unsafeUnwrap();

const buildFakeGateway = (): {
  gateway: RelayGateway;
  listeners: Map<SessionIdentifier, RelayEventListener>;
  unsubscribeCalls: SessionIdentifier[];
} => {
  const listeners = new Map<SessionIdentifier, RelayEventListener>();
  const unsubscribeCalls: SessionIdentifier[] = [];
  const subscribe: RelayGateway['subscribe'] = (sessionIdentifier, listener) => {
    listeners.set(sessionIdentifier, listener);
    return () => {
      unsubscribeCalls.push(sessionIdentifier);
      listeners.delete(sessionIdentifier);
    };
  };
  const gateway: RelayGateway = {
    openSession: vi.fn(() => okAsync(undefined)),
    sendAudioFrame: vi.fn(() => okAsync(undefined)),
    closeSession: vi.fn(() => okAsync(undefined)),
    subscribe: vi.fn(subscribe),
  };
  return { gateway, listeners, unsubscribeCalls };
};

const buildHandler = (
  result: ResultAsync<void, ApplicationError> = okAsync<void, ApplicationError>(undefined),
): RelayEventHandler => vi.fn<RelayEventHandler>(() => result);

describe('createRelaySessionSubscriber (IMPL-600)', () => {
  it('subscribes on start and dispatches events to handleEvent', () => {
    const { gateway, listeners } = buildFakeGateway();
    const handleEvent = buildHandler();
    const subscriber = createRelaySessionSubscriber({
      relayGateway: gateway,
      handleEvent,
    });

    subscriber.start(identifierA);
    expect(gateway.subscribe).toHaveBeenCalledWith(identifierA, expect.any(Function));

    const event: RelayEvent = {
      type: 'transcript.final',
      sessionIdentifier: identifierA,
      segmentIdentifier: 'seg-1',
      text: 'Hello',
      finalizedAt: '2026-04-22T00:00:00.000Z',
    };
    listeners.get(identifierA)?.(event);
    expect(handleEvent).toHaveBeenCalledWith(event);
  });

  it('stop releases the subscription', () => {
    const { gateway, unsubscribeCalls } = buildFakeGateway();
    const subscriber = createRelaySessionSubscriber({
      relayGateway: gateway,
      handleEvent: buildHandler(),
    });
    subscriber.start(identifierA);
    expect(subscriber.activeCount()).toBe(1);
    subscriber.stop(identifierA);
    expect(unsubscribeCalls).toEqual([identifierA]);
    expect(subscriber.activeCount()).toBe(0);
  });

  it('stop for unregistered session is a no-op', () => {
    const { gateway, unsubscribeCalls } = buildFakeGateway();
    const subscriber = createRelaySessionSubscriber({
      relayGateway: gateway,
      handleEvent: buildHandler(),
    });
    subscriber.stop(identifierA);
    expect(unsubscribeCalls).toEqual([]);
  });

  it('start twice for same session releases existing subscription first (idempotent)', () => {
    const { gateway, unsubscribeCalls } = buildFakeGateway();
    const subscriber = createRelaySessionSubscriber({
      relayGateway: gateway,
      handleEvent: buildHandler(),
    });
    subscriber.start(identifierA);
    subscriber.start(identifierA);
    expect(unsubscribeCalls).toEqual([identifierA]);
    expect(gateway.subscribe).toHaveBeenCalledTimes(2);
    expect(subscriber.activeCount()).toBe(1);
  });

  it('stopAll releases every active subscription', () => {
    const { gateway, unsubscribeCalls } = buildFakeGateway();
    const subscriber = createRelaySessionSubscriber({
      relayGateway: gateway,
      handleEvent: buildHandler(),
    });
    subscriber.start(identifierA);
    subscriber.start(identifierB);
    expect(subscriber.activeCount()).toBe(2);
    subscriber.stopAll();
    expect(new Set(unsubscribeCalls)).toEqual(new Set([identifierA, identifierB]));
    expect(subscriber.activeCount()).toBe(0);
  });

  it('logs warn when handleEvent returns Err', async () => {
    const logWarn = vi.fn();
    const { gateway, listeners } = buildFakeGateway();
    const handleEvent = buildHandler(errAsync(internalAppError({ message: 'boom' })));
    const subscriber = createRelaySessionSubscriber({
      relayGateway: gateway,
      handleEvent,
      logWarn,
    });
    subscriber.start(identifierA);
    listeners.get(identifierA)?.({
      type: 'session.error',
      sessionIdentifier: identifierA,
      code: 'X',
      message: 'e',
      retryable: false,
      fatal: false,
    });
    await Promise.resolve();
    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('boom'));
  });

  it('logs warn when Unsubscribe throws', () => {
    const logWarn = vi.fn();
    const gateway: RelayGateway = {
      openSession: vi.fn(() => okAsync(undefined)),
      sendAudioFrame: vi.fn(() => okAsync(undefined)),
      closeSession: vi.fn(() => okAsync(undefined)),
      subscribe: vi.fn(() => {
        return () => {
          throw new Error('unsub failed');
        };
      }),
    };
    const subscriber = createRelaySessionSubscriber({
      relayGateway: gateway,
      handleEvent: buildHandler(),
      logWarn,
    });
    subscriber.start(identifierA);
    subscriber.stop(identifierA);
    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('unsub failed'));
  });
});
