import { errAsync, okAsync } from 'neverthrow';
import { describe, expect, it } from 'vitest';
import {
  parseSessionIdentifier,
  type SessionIdentifier,
} from '../../domain/session/session-identifier';
import { invariantViolationError, type DomainError } from '../../domain/shared/errors';
import {
  type SourceAdapter,
  type SourceAdapterFactory,
  type StartSourceCommand,
} from './source-adapter';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const sessionIdentifier: SessionIdentifier = parseSessionIdentifier(SESSION_ID)._unsafeUnwrap();

const tabCommand: StartSourceCommand = {
  sourceType: 'tab',
  sessionIdentifier,
  tabId: 42,
};

const microphoneCommand: StartSourceCommand = {
  sourceType: 'microphone',
  sessionIdentifier,
  deviceId: 'default',
};

const desktopCommand: StartSourceCommand = {
  sourceType: 'desktop',
  sessionIdentifier,
};

const erroringAdapter: SourceAdapter = {
  open: () =>
    errAsync<MediaStream, DomainError>(
      invariantViolationError({
        invariant: 'source-open-failed',
        details: 'capture permission denied',
      }),
    ),
  close: () => okAsync(undefined),
};

describe('SourceAdapter (DD-101〜103)', () => {
  describe('type contract', () => {
    it('accepts an object literal that implements open and close', () => {
      expect(typeof erroringAdapter.open).toBe('function');
      expect(typeof erroringAdapter.close).toBe('function');
    });
  });

  describe('StartSourceCommand discriminated union', () => {
    it('accepts tab variant with optional tabId', () => {
      expect(tabCommand.sourceType).toBe('tab');
      if (tabCommand.sourceType === 'tab') {
        expect(tabCommand.tabId).toBe(42);
      }
    });

    it('accepts microphone variant with optional deviceId', () => {
      expect(microphoneCommand.sourceType).toBe('microphone');
      if (microphoneCommand.sourceType === 'microphone') {
        expect(microphoneCommand.deviceId).toBe('default');
      }
    });

    it('accepts desktop variant without additional fields', () => {
      expect(desktopCommand.sourceType).toBe('desktop');
    });
  });

  describe('open error path', () => {
    it('returns invariantViolationError when capture fails', async () => {
      const result = await erroringAdapter.open(tabCommand);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.kind).toBe('invariant-violation');
        if (result.error.kind === 'invariant-violation') {
          expect(result.error.invariant).toBe('source-open-failed');
        }
      }
    });
  });

  describe('close', () => {
    it('resolves to ok(void) on the success path', async () => {
      const result = await erroringAdapter.close(sessionIdentifier);
      expect(result.isOk()).toBe(true);
    });
  });
});

describe('SourceAdapterFactory', () => {
  const factoryMock: SourceAdapterFactory = {
    create: () => erroringAdapter,
  };

  it('accepts an object literal implementing create', () => {
    expect(typeof factoryMock.create).toBe('function');
  });

  it('returns a SourceAdapter instance for a given sourceType', () => {
    const adapter = factoryMock.create('tab');
    expect(typeof adapter.open).toBe('function');
    expect(typeof adapter.close).toBe('function');
  });
});
