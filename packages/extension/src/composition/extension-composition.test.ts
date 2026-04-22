import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createExtensionProfile } from '../domain/profile/extension-profile';
import { createOverlaySettings } from '../domain/profile/overlay-settings';
import { createLanguagePair } from '../domain/session/language-pair';
import { type ChromeStorageAdapter } from '../infrastructure/storage/chrome-local-settings-store';
import { createChromeLocalExtensionProfileRepository } from '../infrastructure/storage/chrome-local-extension-profile-repository';
import { INDEXED_DB_NAME } from '../infrastructure/storage/open-perapera-db';
import {
  createExtensionApp,
  type ExtensionApp,
  type ExtensionRuntimeConfig,
  type ExtensionRuntimePorts,
} from './extension-composition';

const PROFILE_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7C1';
const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const SOURCE_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7B1';
const TRANSLATION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7E1';
const EXPORT_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7F1';

const createFakeStorage = (): ChromeStorageAdapter => {
  const store = new Map<string, unknown>();
  return {
    get: (keys) => {
      const result: Record<string, unknown> = {};
      for (const key of keys) {
        if (store.has(key)) result[key] = store.get(key);
      }
      return Promise.resolve(result);
    },
    set: (items) => {
      for (const [key, value] of Object.entries(items)) {
        store.set(key, value);
      }
      return Promise.resolve();
    },
  };
};

const createTestPorts = (overrides: Partial<ExtensionRuntimePorts> = {}): ExtensionRuntimePorts => {
  const storage = overrides.chromeStorageAdapter ?? createFakeStorage();
  return {
    chromePermissionsApi: {
      contains: vi.fn(() => Promise.resolve(true)),
      request: vi.fn(() => Promise.resolve(true)),
    },
    chromeStorageAdapter: storage,
    audioContextFactory: vi.fn(() => ({
      sampleRate: 16000,
      audioWorklet: { addModule: vi.fn(() => Promise.resolve()) },
      close: vi.fn(() => Promise.resolve()),
      createMediaStreamSource: vi.fn(() => ({})),
    })),
    webSocketFactory: vi.fn(() => ({
      readyState: 1,
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
    fetchImpl: vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            sessionId: SESSION_ID,
            streamToken: 'jwt.stream.token',
            relayUrl: 'wss://test',
            expiresAt: '2026-04-22T00:00:00.000Z',
            heartbeatIntervalSec: 15,
            audio: {
              encoding: 'pcm_s16le',
              sampleRateHz: 16000,
              channels: 1,
              frameDurationMs: 100,
              transport: 'json-base64',
            },
            limits: { maxConcurrentSessions: 3, maxFrameRatePerSecond: 10 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    ),
    overlayMessagingBridge: { send: vi.fn(() => Promise.resolve()) },
    chromeRuntimeApi: { sendMessage: vi.fn(() => Promise.resolve(undefined)) },
    tabCaptureApi: {
      capture: vi.fn(() => Promise.resolve(null)),
      getMediaStreamId: vi.fn(() => Promise.resolve('stream-id-fixture')),
    },
    userMediaApi: { getUserMedia: vi.fn(() => Promise.reject(new Error('not implemented'))) },
    desktopCaptureApi: {
      getDisplayMedia: vi.fn(() => Promise.reject(new Error('not implemented'))),
    },
    clockMs: () => 1_700_000_000_000,
    clockIso: () => '2026-04-21T00:00:00.000Z',
    sessionIdFactory: () => SESSION_ID,
    sourceIdFactory: () => SOURCE_ID,
    translationIdFactory: () => TRANSLATION_ID,
    exportIdFactory: () => EXPORT_ID,
    ...overrides,
  };
};

const defaultConfig: ExtensionRuntimeConfig = {
  relayApiBaseUrl: 'http://localhost:3001',
  relayAccessToken: 'access-token-fixture-value',
  extensionVersion: '0.1.0',
  protocolVersion: '1.0',
  workletModuleUrl: '/audio-worklet.js',
};

describe('createExtensionApp (IMPL-500)', () => {
  let app: ExtensionApp | null = null;
  let databaseName: string;
  let config: ExtensionRuntimeConfig;

  beforeEach(() => {
    app = null;
    databaseName = `${INDEXED_DB_NAME}-test-${String(Math.random()).slice(2)}`;
    config = { ...defaultConfig, databaseName };
  });

  afterEach(async () => {
    if (app !== null) await app.close();
  });

  it('returns all composed facades with real adapters', () => {
    app = createExtensionApp(config, createTestPorts());
    expect(app.sessionCommandService).toBeDefined();
    expect(app.exportService).toBeDefined();
    expect(app.getSessionMonitorStateQuery).toBeDefined();
    expect(app.sessionRegistry).toBeDefined();
    expect(app.captureOrchestrator).toBeDefined();
    expect(app.audioFramePump).toBeDefined();
    expect(app.audioFramePump.activeCount()).toBe(0);
    expect(app.offscreenCommandSender).toBeDefined();
    expect(app.offscreenCommandSender.openAudioContext).toBeTypeOf('function');
    expect(app.audioFrameForwardReceiver).toBeDefined();
    expect(app.audioFrameForwardReceiver.receive).toBeTypeOf('function');
    expect(app.orphanSessionCleanup).toBeDefined();
    expect(app.orphanSessionCleanup.cleanup).toBeTypeOf('function');
    expect(app.transcriptAssembler).toBeDefined();
    expect(app.close).toBeTypeOf('function');
  });

  it('orphanSessionCleanup.cleanup resolves to recoveredCount 0 when IndexedDB is empty', async () => {
    app = createExtensionApp(config, createTestPorts());
    const result = await app.orphanSessionCleanup.cleanup();
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.recoveredCount).toBe(0);
    }
  });

  it('SessionRegistry starts empty', () => {
    app = createExtensionApp(config, createTestPorts());
    expect(app.sessionRegistry.listAll()).toEqual([]);
    expect(app.sessionRegistry.findActive()).toEqual([]);
  });

  it('stopSource on non-existent session returns session-not-found ApplicationError', async () => {
    app = createExtensionApp(config, createTestPorts());
    const result = await app.sessionCommandService.stopSource({ sessionId: SESSION_ID });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('session-not-found');
    }
  });

  it('getSessionMonitorStateQuery returns ok with no active sessions', async () => {
    app = createExtensionApp(config, createTestPorts());
    const result = await app.getSessionMonitorStateQuery({ includeOverlayState: false });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.sessions).toEqual([]);
    }
  });

  it('startSource fails with permission-required when ChromePermissionsApi denies', async () => {
    const storage = createFakeStorage();
    // Seed a profile so startSource does not fail on ExtensionProfileRepository
    const profile = createExtensionProfile({
      profileIdentifier: PROFILE_ID,
      defaultLanguagePair: createLanguagePair({
        source: 'en-US',
        target: 'ja-JP',
      })._unsafeUnwrap(),
      defaultOverlaySettings: createOverlaySettings({
        positionPreset: 'bottom',
        opacity: 0.8,
        maxLines: 2,
        fontScale: 1,
        showOriginalText: true,
        showTranslatedText: true,
      })._unsafeUnwrap(),
      autoDetectEnabled: false,
    })._unsafeUnwrap();
    const profileRepo = createChromeLocalExtensionProfileRepository(storage);
    await profileRepo.save(profile);

    const ports = createTestPorts({
      chromeStorageAdapter: storage,
      chromePermissionsApi: {
        contains: vi.fn(() => Promise.resolve(false)),
        request: vi.fn(() => Promise.resolve(false)),
      },
    });
    app = createExtensionApp(config, ports);
    const result = await app.sessionCommandService.startSource({
      sourceType: 'tab',
      displayName: 'test',
      autoDetectLanguage: false,
      targetLanguage: 'ja-JP',
      overlayTarget: { kind: 'tab', tabId: 42 },
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('permission-required');
    }
  });

  it('close terminates all IndexedDB connections without throwing', async () => {
    app = createExtensionApp(config, createTestPorts());
    await expect(app.close()).resolves.toBeUndefined();
    app = null;
  });
});
