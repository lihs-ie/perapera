import { describe, expect, it } from 'vitest';
import {
  createRelaySession,
  endSession,
  markSessionError,
  startStreaming,
  type CreateRelaySessionParams,
} from './relay-session';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const TOKEN_ID = 'strm_01HZX8Y1R8M7D3Q2P4T5V6W7A2';

const baseParams = (
  overrides: Partial<CreateRelaySessionParams> = {},
): CreateRelaySessionParams => ({
  sessionIdentifier: SESSION_ID,
  streamTokenIdentifier: TOKEN_ID,
  sourceType: 'tab',
  displayName: 'YouTube Live',
  sourceLanguage: 'en-US',
  autoDetectLanguage: false,
  targetLanguage: 'ja-JP',
  overlayTarget: { kind: 'tab', tabId: 42 },
  client: { extensionVersion: '0.1.0', protocolVersion: '1.0' },
  createdAt: '2026-04-21T00:00:00.000Z',
  expiresAt: '2026-04-21T01:00:00.000Z',
  ...overrides,
});

describe('createRelaySession', () => {
  it('creates a session in created state', () => {
    const result = createRelaySession(baseParams());
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.state).toBe('created');
      expect(result.value.sourceType).toBe('tab');
      expect(result.value.overlayTarget.kind).toBe('tab');
    }
  });

  it('allows sourceLanguage=null when autoDetectLanguage is true', () => {
    const result = createRelaySession(
      baseParams({ sourceLanguage: null, autoDetectLanguage: true }),
    );
    expect(result.isOk()).toBe(true);
  });

  it('rejects sourceLanguage=null when autoDetectLanguage is false', () => {
    const result = createRelaySession(
      baseParams({ sourceLanguage: null, autoDetectLanguage: false }),
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('invariant-violation');
  });

  it('rejects invalid sourceType', () => {
    const result = createRelaySession(baseParams({ sourceType: 'webcam' }));
    expect(result.isErr()).toBe(true);
  });

  it('rejects empty displayName', () => {
    const result = createRelaySession(baseParams({ displayName: '   ' }));
    expect(result.isErr()).toBe(true);
  });

  it('rejects invalid sourceLanguage', () => {
    const result = createRelaySession(baseParams({ sourceLanguage: 'not-a-tag' }));
    expect(result.isErr()).toBe(true);
  });

  it('rejects invalid targetLanguage', () => {
    const result = createRelaySession(baseParams({ targetLanguage: 'xx-zz' }));
    expect(result.isErr()).toBe(true);
  });

  it('rejects overlayTarget with invalid kind', () => {
    const result = createRelaySession(baseParams({ overlayTarget: { kind: 'popup' } }));
    expect(result.isErr()).toBe(true);
  });

  it('rejects expiresAt equal to createdAt', () => {
    const result = createRelaySession(
      baseParams({ createdAt: '2026-04-21T00:00:00.000Z', expiresAt: '2026-04-21T00:00:00.000Z' }),
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('invariant-violation');
  });

  it('rejects expiresAt before createdAt', () => {
    const result = createRelaySession(
      baseParams({ createdAt: '2026-04-21T00:00:00.000Z', expiresAt: '2026-04-20T00:00:00.000Z' }),
    );
    expect(result.isErr()).toBe(true);
  });

  it('rejects non-ISO 8601 createdAt', () => {
    const result = createRelaySession(baseParams({ createdAt: 'yesterday' }));
    expect(result.isErr()).toBe(true);
  });

  it('accepts extension-monitor overlayTarget', () => {
    const result = createRelaySession(
      baseParams({ overlayTarget: { kind: 'extension-monitor', pageId: 'monitor-01' } }),
    );
    expect(result.isOk()).toBe(true);
  });
});

describe('state transitions', () => {
  const built = createRelaySession(baseParams())._unsafeUnwrap();

  it('startStreaming moves from created → streaming', () => {
    const result = startStreaming(built);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value.state).toBe('streaming');
  });

  it('endSession moves from created → ended', () => {
    const result = endSession(built);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value.state).toBe('ended');
  });

  it('markSessionError moves from created → error', () => {
    const result = markSessionError(built);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value.state).toBe('error');
  });

  it('endSession is rejected from ended state', () => {
    const ended = endSession(built)._unsafeUnwrap();
    const result = endSession(ended);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('session-state-transition');
  });

  it('startStreaming is rejected from ended state', () => {
    const ended = endSession(built)._unsafeUnwrap();
    const result = startStreaming(ended);
    expect(result.isErr()).toBe(true);
  });

  it('markSessionError is rejected from error state', () => {
    const erroredSession = markSessionError(built)._unsafeUnwrap();
    const result = markSessionError(erroredSession);
    expect(result.isErr()).toBe(true);
  });
});
