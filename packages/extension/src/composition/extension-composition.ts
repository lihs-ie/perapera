import { okAsync } from 'neverthrow';
import { ulid } from 'ulidx';
import { createExportSessionResultUseCase } from '../application/use-cases/export-session-result-use-case';
import { createGetSessionMonitorStateQuery } from '../application/use-cases/get-session-monitor-state-query';
import { createHandleTranscriptFinalUseCase } from '../application/use-cases/handle-transcript-final-use-case';
import { createHandleTranscriptPartialUseCase } from '../application/use-cases/handle-transcript-partial-use-case';
import { createStartSourceSessionUseCase } from '../application/use-cases/start-source-session-use-case';
import { createStopSourceSessionUseCase } from '../application/use-cases/stop-source-session-use-case';
import { createUpdateSourceSettingsUseCase } from '../application/use-cases/update-source-settings-use-case';
import {
  createAudioFramePump,
  type AudioFramePump,
} from '../application/services/audio-frame-pump';
import {
  createCaptureOrchestrator,
  type CaptureOrchestrator,
} from '../application/services/capture-orchestrator';
import {
  createAudioFrameForwardReceiver,
  type AudioFrameForwardReceiver,
} from '../application/services/audio-frame-forward-receiver';
import {
  createEnsureDefaultProfile,
  type EnsureDefaultProfile,
} from '../application/services/ensure-default-profile';
import { createExportService, type ExportService } from '../application/services/export-service';
import {
  createOffscreenCommandSender,
  type OffscreenCommandSender,
  type RuntimeMessageBridge,
} from '../application/services/offscreen-command-sender';
import {
  createOrphanSessionCleanupService,
  type OrphanSessionCleanupService,
} from '../application/services/orphan-session-cleanup-service';
import {
  createRelaySessionSubscriber,
  type RelayEventHandler,
  type RelaySessionSubscriber,
} from '../application/services/relay-session-subscriber';
import {
  createSessionCommandService,
  type SessionCommandService,
} from '../application/services/session-command-service';
import {
  createSessionRegistry,
  type SessionRegistry,
} from '../application/services/session-registry';
import {
  createTranscriptAssembler,
  type TranscriptAssembler,
} from '../application/services/transcript-assembler';
import { type GetSessionMonitorStateQuery } from '../application/use-cases/get-session-monitor-state-query';
import { type SourceSession } from '../domain/session/source-session';
import {
  defaultAudioContextFactory,
  type AudioContextFactory,
} from '../infrastructure/audio/audio-preprocessor';
import {
  defaultDesktopCaptureApi,
  type DesktopCaptureApi,
} from '../infrastructure/capture/desktop-capture-source-adapter';
import {
  defaultTabCaptureApi,
  type TabCaptureApi,
} from '../infrastructure/capture/tab-capture-source-adapter';
import {
  defaultUserMediaApi,
  type UserMediaApi,
} from '../infrastructure/capture/user-media-source-adapter';
import {
  createChromeRuntimeMessageBridge,
  defaultChromeRuntimeApi,
  type ChromeRuntimeApi,
} from '../infrastructure/messaging/chrome-runtime-message-bridge';
import { createChromeTabStreamIdResolver } from '../infrastructure/capture/chrome-tab-stream-id-resolver';
import {
  createChromeMessagingOverlayPresenter,
  defaultOverlayMessagingBridge,
  type OverlayMessagingBridge,
} from '../infrastructure/overlay/chrome-messaging-overlay-presenter';
import {
  createChromePermissionCoordinator,
  defaultChromePermissionsApi,
  type ChromePermissionsApi,
} from '../infrastructure/permission/chrome-permission-coordinator';
import {
  createFetchStreamTokenIssuer,
  type OverlayTargetDescriptor,
} from '../infrastructure/relay/fetch-stream-token-issuer';
import { createRelayWebSocketGateway } from '../infrastructure/relay/relay-websocket-gateway';
import {
  createBrowserWebSocketFactory,
  type WebSocketFactory,
} from '../infrastructure/relay/websocket-factory';
import {
  createChromeLocalExtensionProfileRepository,
  createChromeLocalSettingsStore,
  createIndexedDbExportRecordRepository,
  createIndexedDbSessionStore,
  createIndexedDbSourceSessionRepository,
  createIndexedDbTranscriptStreamRepository,
  defaultChromeStorageAdapter,
  type ChromeStorageAdapter,
  type CloseableExportRecordRepository,
  type CloseableSessionStore,
  type CloseableSourceSessionRepository,
  type CloseableTranscriptStreamRepository,
} from '../infrastructure/storage';

/**
 * IMPL-500 Background Service Worker composition root。
 *
 * 拡張エントリポイント (`entrypoints/background.ts`) から呼び出される DI 組立
 * factory。Phase 1〜3.5 の全 infrastructure adapter と Phase 2 UseCase /
 * Phase 3 application service を整合性のある形で配線する。
 *
 * **本番実装で mock / in-memory を使わない原則**:
 * - 全 adapter が real implementation。`createProductionRuntimePorts` で
 *   `chrome.*` / AudioContext / fetch / WebSocket などの production default を集約
 * - test で利用する場合は `createExtensionApp(config, testPorts)` のように
 *   override を明示注入 (ports の各要素は optional ではなく Required)
 *
 * 返り値 `ExtensionApp` は 3 つの application facade + SessionRegistry +
 * teardown 関数を公開する。Service Worker は `sessionCommandService` を
 * runtime message dispatch の dispatch target として使う。
 */
export type ExtensionRuntimeConfig = Readonly<{
  /** Relay API base URL (例: `http://localhost:3001` / `https://relay.example.com`)。末尾 / なし */
  relayApiBaseUrl: string;
  /** POST /sessions 用の Bearer access token。`CLAUDE.md` §データ保存方針に従い chrome.storage 管理 */
  relayAccessToken: string;
  /** 拡張バージョン (manifest.version) */
  extensionVersion: string;
  /** api-specification §4.1 client.protocolVersion */
  protocolVersion: string;
  /** IndexedDB 名 (default `perapera`) */
  databaseName?: string;
  /** AudioWorklet module URL (通常 `chrome.runtime.getURL('/audio-worklet.js')`) */
  workletModuleUrl: string;
  /**
   * Offscreen document の存在を保証する idempotent Promise factory。
   * `offscreenCommandSender` から送信前に呼ばれる。未指定ならチェックなし
   * (test の最小 wire / 単純 smoke 用)。production は `offscreenLifecycle.ensure`
   * を渡す。
   */
  ensureOffscreen?: () => Promise<void>;
  /** SourceSession → displayName (default: sourceType 名) */
  resolveDisplayName?: (session: SourceSession) => string;
  /** SourceSession → overlayTarget (default: `{ kind: 'extension-monitor', pageId: 'monitor' }`) */
  resolveOverlayTarget?: (session: SourceSession) => OverlayTargetDescriptor;
  /** SourceSession → autoDetectLanguage (default: `false`) */
  resolveAutoDetectLanguage?: (session: SourceSession) => boolean;
}>;

/**
 * Infrastructure DI port 集合。production では `createProductionRuntimePorts()` の
 * 結果をそのまま渡す。test では `chrome.*` を fake に差し替える。
 */
export type ExtensionRuntimePorts = Readonly<{
  chromePermissionsApi: ChromePermissionsApi;
  chromeStorageAdapter: ChromeStorageAdapter;
  audioContextFactory: AudioContextFactory;
  webSocketFactory: WebSocketFactory;
  fetchImpl: typeof fetch;
  overlayMessagingBridge: OverlayMessagingBridge;
  chromeRuntimeApi: ChromeRuntimeApi;
  tabCaptureApi: TabCaptureApi;
  userMediaApi: UserMediaApi;
  desktopCaptureApi: DesktopCaptureApi;
  clockMs: () => number;
  clockIso: () => string;
  sessionIdFactory: () => string;
  sourceIdFactory: () => string;
  translationIdFactory: () => string;
  exportIdFactory: () => string;
}>;

/**
 * 拡張 production 環境向け DI port の既定セット。Service Worker 起動時に
 * 一度だけ生成して `createExtensionApp` に渡す。
 *
 * すべて Phase 3 / Phase 3.5 で作成済の `defaultXxx` を使う。DI 対象は
 * chrome.\* / AudioContext / fetch / WebSocket / ulid などの外部境界に限る。
 */
export const createProductionRuntimePorts = (): ExtensionRuntimePorts => ({
  chromePermissionsApi: defaultChromePermissionsApi,
  chromeStorageAdapter: defaultChromeStorageAdapter,
  audioContextFactory: defaultAudioContextFactory,
  webSocketFactory: createBrowserWebSocketFactory(),
  fetchImpl: fetch,
  overlayMessagingBridge: defaultOverlayMessagingBridge,
  chromeRuntimeApi: defaultChromeRuntimeApi,
  tabCaptureApi: defaultTabCaptureApi,
  userMediaApi: defaultUserMediaApi,
  desktopCaptureApi: defaultDesktopCaptureApi,
  clockMs: () => Date.now(),
  clockIso: () => new Date().toISOString(),
  sessionIdFactory: () => ulid(),
  sourceIdFactory: () => ulid(),
  translationIdFactory: () => ulid(),
  exportIdFactory: () => ulid(),
});

/**
 * Service Worker 起動時に 1 度だけ生成される拡張アプリ。複数 facade を
 * message dispatcher や popup/sidepanel から利用する。
 *
 * `close()` は IndexedDB connection と chrome-storage adapter の teardown を行う。
 * Service Worker shutdown 時に呼ぶ (chrome.runtime.onSuspend 等)。
 */
export type ExtensionApp = Readonly<{
  sessionCommandService: SessionCommandService;
  exportService: ExportService;
  getSessionMonitorStateQuery: GetSessionMonitorStateQuery;
  sessionRegistry: SessionRegistry;
  captureOrchestrator: CaptureOrchestrator;
  audioFramePump: AudioFramePump;
  offscreenCommandSender: OffscreenCommandSender;
  audioFrameForwardReceiver: AudioFrameForwardReceiver;
  orphanSessionCleanup: OrphanSessionCleanupService;
  ensureDefaultProfile: EnsureDefaultProfile;
  transcriptAssembler: TranscriptAssembler;
  close: () => Promise<void>;
}>;

const DEFAULT_RESOLVE_DISPLAY_NAME = (session: SourceSession): string => session.sourceType;
const DEFAULT_RESOLVE_OVERLAY_TARGET = (_session: SourceSession): OverlayTargetDescriptor => ({
  kind: 'extension-monitor',
  pageId: 'monitor',
});
const DEFAULT_RESOLVE_AUTO_DETECT = (_session: SourceSession): boolean => false;

export const createExtensionApp = (
  config: ExtensionRuntimeConfig,
  ports: ExtensionRuntimePorts,
): ExtensionApp => {
  // --------------- Storage (Phase 3 / 3.5) ---------------
  const databaseName = config.databaseName;
  const dbOptions = databaseName !== undefined ? { databaseName } : {};

  const sessionStore: CloseableSessionStore = createIndexedDbSessionStore(dbOptions);
  const settingsStore = createChromeLocalSettingsStore(ports.chromeStorageAdapter);

  const sourceSessionRepository: CloseableSourceSessionRepository =
    createIndexedDbSourceSessionRepository(dbOptions);
  const transcriptStreamRepository: CloseableTranscriptStreamRepository =
    createIndexedDbTranscriptStreamRepository(dbOptions);
  const exportRecordRepository: CloseableExportRecordRepository =
    createIndexedDbExportRecordRepository(dbOptions);
  const extensionProfileRepository = createChromeLocalExtensionProfileRepository(
    ports.chromeStorageAdapter,
  );

  // --------------- Capture / Audio ---------------
  // SW 側 CaptureOrchestrator は placeholder のため、SourceAdapter / AudioPreprocessor
  // は SW では生成しない。実 stream / AudioWorklet は offscreen document 側で
  // TabStreamApi / defaultAudioContextFactory / defaultWorkletNodeFactory を直接使う
  // (packages/extension/src/entrypoints/offscreen/main.ts)。

  // --------------- Permission + Relay ---------------
  const permissionCoordinator = createChromePermissionCoordinator({
    chromePermissionsApi: ports.chromePermissionsApi,
  });
  const tokenIssuer = createFetchStreamTokenIssuer({
    baseUrl: config.relayApiBaseUrl,
    accessToken: config.relayAccessToken,
    extensionVersion: config.extensionVersion,
    protocolVersion: config.protocolVersion,
    resolveDisplayName: config.resolveDisplayName ?? DEFAULT_RESOLVE_DISPLAY_NAME,
    resolveOverlayTarget: config.resolveOverlayTarget ?? DEFAULT_RESOLVE_OVERLAY_TARGET,
    resolveAutoDetectLanguage: config.resolveAutoDetectLanguage ?? DEFAULT_RESOLVE_AUTO_DETECT,
    fetchImpl: ports.fetchImpl,
  });
  // WS 接続先は Relay が `POST /sessions` レスポンスで返す `relayUrl`
  // (`{ data: { relayUrl: 'ws://.../relay' } }`) を dynamic に使う。
  // config.relayApiBaseUrl に wsPath を足して静的に URL を組み立てない。
  const relayGateway = createRelayWebSocketGateway({
    webSocketFactory: ports.webSocketFactory,
    tokenIssuer,
    clock: ports.clockMs,
    protocolVersion: config.protocolVersion,
  });

  // --------------- Overlay / presenter ---------------
  const overlayPresenter = createChromeMessagingOverlayPresenter({
    bridge: ports.overlayMessagingBridge,
  });

  // --------------- Application services (先に構築: circular dep 回避) ---------------
  // MV3 SW では MediaStream / AudioContext が動作しないため、CaptureOrchestrator は
  // SW-safe な placeholder (empty frame channel) として動作。実 stream / AudioWorklet
  // は offscreen document 側が担う (IMPL-612〜618)。
  const captureOrchestrator = createCaptureOrchestrator();

  // relaySessionSubscriber は handleEvent を late-bind する形で参照する。
  // SessionCommandService を先に構築したいが、sessionCommandService は
  // startSourceSessionUseCase 経由で subscriber に依存するため、mutable holder で
  // 後から設定する。
  let sessionCommandServiceRef: SessionCommandService | null = null;
  const handleRelayEventLate: RelayEventHandler = (event) => {
    if (sessionCommandServiceRef === null) {
      // SW 起動直後に event が届くことはないが、安全のため no-op を返す
      return okAsync<void, never>(undefined);
    }
    return sessionCommandServiceRef.handleRelayEvent(event);
  };
  const relaySessionSubscriber: RelaySessionSubscriber = createRelaySessionSubscriber({
    relayGateway,
    handleEvent: handleRelayEventLate,
  });
  const audioFramePump: AudioFramePump = createAudioFramePump();
  const ensureDefaultProfile: EnsureDefaultProfile = createEnsureDefaultProfile({
    extensionProfileRepository,
  });
  const runtimeMessageBridge: RuntimeMessageBridge = createChromeRuntimeMessageBridge(
    ports.chromeRuntimeApi,
  );
  const offscreenCommandSender: OffscreenCommandSender = createOffscreenCommandSender({
    bridge: runtimeMessageBridge,
    ...(config.ensureOffscreen !== undefined ? { ensureOffscreen: config.ensureOffscreen } : {}),
  });
  const tabStreamIdResolver = createChromeTabStreamIdResolver(ports.tabCaptureApi);
  const audioFrameForwardReceiver: AudioFrameForwardReceiver = createAudioFrameForwardReceiver({
    relayGateway,
  });
  const orphanSessionCleanup: OrphanSessionCleanupService = createOrphanSessionCleanupService({
    sourceSessionRepository,
    clock: ports.clockIso,
  });

  // --------------- UseCases (Phase 2) ---------------
  const startSourceSessionUseCase = createStartSourceSessionUseCase({
    sourceSessionRepository,
    extensionProfileRepository,
    relayGateway,
    permissionCoordinator,
    captureOrchestrator,
    relaySessionSubscriber,
    audioFramePump,
    offscreenCommandSender,
    tabStreamIdResolver,
    clock: ports.clockIso,
    idFactory: {
      session: ports.sessionIdFactory,
      source: ports.sourceIdFactory,
    },
  });
  const stopSourceSessionUseCase = createStopSourceSessionUseCase({
    sourceSessionRepository,
    relayGateway,
    overlayPresenter,
    captureOrchestrator,
    relaySessionSubscriber,
    audioFramePump,
    offscreenCommandSender,
    clock: ports.clockIso,
  });
  const updateSourceSettingsUseCase = createUpdateSourceSettingsUseCase({
    sourceSessionRepository,
    overlayPresenter,
    clock: ports.clockIso,
  });
  const handleTranscriptPartialUseCase = createHandleTranscriptPartialUseCase({
    transcriptStreamRepository,
    overlayPresenter,
    sessionStore,
    settingsStore,
  });
  const handleTranscriptFinalUseCase = createHandleTranscriptFinalUseCase({
    transcriptStreamRepository,
    overlayPresenter,
    sessionStore,
    settingsStore,
    translationIdFactory: ports.translationIdFactory,
  });
  const exportSessionResultUseCase = createExportSessionResultUseCase({
    sessionStore,
    exportRecordRepository,
    clock: ports.clockIso,
    exportIdFactory: ports.exportIdFactory,
  });
  const getSessionMonitorStateQuery = createGetSessionMonitorStateQuery({
    sourceSessionRepository,
    transcriptStreamRepository,
    settingsStore,
  });

  // --------------- Application services (Phase 3 facades) ---------------
  const sessionCommandService = createSessionCommandService({
    startSourceSessionUseCase,
    stopSourceSessionUseCase,
    updateSourceSettingsUseCase,
    handleTranscriptPartialUseCase,
    handleTranscriptFinalUseCase,
    clock: ports.clockMs,
  });
  // 構築完了後に late-bind 用 ref に保存。以降 relaySessionSubscriber の
  // dispatch が handleRelayEvent を呼べるようになる。
  sessionCommandServiceRef = sessionCommandService;

  const exportService = createExportService({ exportSessionResultUseCase });
  const sessionRegistry = createSessionRegistry();
  const transcriptAssembler = createTranscriptAssembler();

  return {
    sessionCommandService,
    exportService,
    getSessionMonitorStateQuery,
    sessionRegistry,
    captureOrchestrator,
    audioFramePump,
    offscreenCommandSender,
    audioFrameForwardReceiver,
    orphanSessionCleanup,
    ensureDefaultProfile,
    transcriptAssembler,
    close: async () => {
      relaySessionSubscriber.stopAll();
      audioFramePump.stopAll();
      await sessionStore.close();
      await sourceSessionRepository.close();
      await transcriptStreamRepository.close();
      await exportRecordRepository.close();
    },
  };
};
