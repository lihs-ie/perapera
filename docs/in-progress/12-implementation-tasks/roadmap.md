---
title: 実装ロードマップ
version: '0.5.23'
status: in-progress
created: '2026-04-21'
last_updated: '2026-04-23'
author: 'Codex'
---

# 実装ロードマップ

## 1. 位置付け

本文書は [`Task.md`](./Task.md) (実装タスクの全量カタログ) を補完する、**前進方向の優先順位付け** である。作業順・直近 PR・未決事項・方針原則をまとめる。

**IMPL 番号の運用方針**:

- `Task.md` は設計時点のプランで、Phase 5 = `IMPL-500〜541`、Phase 6 = `IMPL-600〜619` が予約されている
- 本 roadmap では `IMPL-500/501/502` → `IMPL-510〜553` (Popup/SidePanel) → `IMPL-554〜558` (Content overlay) → `IMPL-560〜564` (Offscreen/Monitor) → `IMPL-590/591` (tokens) → `IMPL-600〜605` (integration/audio/cleanup/E2E) と段階的に実装してきた
- 結果として **roadmap で使う `IMPL-600〜605` は Task.md の Phase 6 番号 (IMPL-600〜608) と衝突する** が、commit/PR タイトル・コミットメッセージとの一貫性を保つために本 roadmap の番号を維持する
- **現実装の状態は本 roadmap を正とする**。`Task.md` の Phase 5/6 セクションは設計時点の予定として保持するが、実装後の整理は本 roadmap §2/§4/§6 に集約する

## 2. 現状サマリ (2026-04-22)

| Phase | 範囲                                                      | 状態                                                    |
| ----- | --------------------------------------------------------- | ------------------------------------------------------- |
| 0     | 着手前合意 (IMPL-001〜005)                                | ✅ 完了                                                 |
| 1     | ドメイン層 (IMPL-101〜153)                                | ✅ 完了                                                 |
| 2     | アプリケーション層 (IMPL-200〜230)                        | ✅ 完了                                                 |
| 3     | 拡張 infrastructure (IMPL-300〜344)                       | ✅ 完了                                                 |
| 3.5   | Domain Repository Adapters (IMPL-140〜143)                | ✅ 完了 (#45)                                           |
| 4     | Relay API (IMPL-400〜451)                                 | ✅ 完了                                                 |
| 5     | 拡張 presentation 層 (IMPL-500〜605)                      | ✅ M2 完了 (実 audio data 転送は Phase 5+ へ分離)       |
| 5+    | Audio data routing (AudioWorklet + offscreen MediaStream) | ✅ 完了 (SW → offscreen → worklet → SW → relay 全結線)  |
| 6     | E2E / 性能 / 品質検証                                     | ✅ 完了 (page render smoke 4 spec + k6 CI + 脅威モデル) |
| 7     | リリース / 運用整備                                       | ⚪ 未着手                                               |

### Phase 5 拡張 presentation 層 内訳 (PR #47〜#53, 2026-04-22 時点)

UI 層 (Popup / SidePanel / Content Script / Monitor) と SW 統合配線が完了。
Phase 5 M2 (unpacked 拡張で実機動作) の foundation が揃った。

**完了:**

- IMPL-500〜502 Background SW composition root + runtime dispatcher + 3 新 adapter
  (ChromePermissionCoordinator / FetchStreamTokenIssuer / ChromeMessagingOverlayPresenter) (PR #47)
- IMPL-510〜551 Popup UI (BackgroundClient + hooks + atoms 6 種 + molecules 3 種 + organisms 2 種 + PopupTemplate) (PR #48)
- IMPL-533/534/542/543/552/553 Side Panel UI (ExportControls + TranscriptPreview + SessionDetailCard + ActiveSessionDetailList + SidePanelTemplate) (PR #49)
- IMPL-554〜558 Content script overlay (OverlayCommand parser + dispatcher + positionPreset/maxLines CSS 反映) (PR #50)
- IMPL-560〜564 Offscreen document + Monitor page (AudioContext host + OverlayListener) (PR #51)
- IMPL-590/591 Design system tokens + fonts (ui-ux-design §3 準拠、dark mode 対応) (PR #52)
- IMPL-600/601 Phase 5 integration (RelaySessionSubscriber + OffscreenLifecycle + UseCase 配線) (PR #53)

**ホットパス完全接続**: Popup → SW → Relay WebSocket → SessionCommandService →
HandleTranscript UseCase → OverlayPresenter → Shadow DOM 描画

**追加完了** (PR #54〜#57):

- IMPL-602 Audio frame pipeline (`audioFramePump`: `captureOrchestrator.frames` → `relayGateway.sendAudioFrame` の SW 内 drain) (PR #54)
- IMPL-603 Orphan session cleanup on SW restart (`stopSourceSession` で active を stopped 化) (PR #55)
- IMPL-604 popup/sidepanel page render smoke E2E + WXT zip 認識更新 (PR #56)
- IMPL-605 monitor page render smoke E2E (PR #57)

**Phase 5 完了基準**: Phase 5 M2 (`wxt dev` で unpacked 拡張 → UI 動作 → ホットパス配線) は **達成**。残るのは MV3 制約下での **実 audio data 転送** (AudioWorklet + offscreen MediaStream 受け取り、§4 PR 次 #12 で扱う、規模大) のみ。

### Phase 3.5 Domain Repository Adapters 内訳 (PR #45, 完了 2026-04-22)

Phase 1 §3.5 (IMPL-140〜143) の domain repository ポートに対応する infrastructure
実装を追加。Phase 3 の `IndexedDbSessionStore` / `ChromeLocalSettingsStore` と
同一 storage を共有しつつ、ドメイン層が要求する整合検査・検索を独立した
adapter として提供。

- IMPL-140 `IndexedDbSourceSessionRepository` (DD-260 / DB-001)
- IMPL-141 `IndexedDbTranscriptStreamRepository` (DD-261 / DB-002, 003) — 防御検証 2 種 (append-final / append-translation) 実装済
- IMPL-142 `ChromeLocalExtensionProfileRepository` (DD-262 / DD-107 / DB-005) — 既存 SettingsStore key 体系と共有
- IMPL-143 `IndexedDbExportRecordRepository` (DD-263 / DB-004)

共通基盤:

- `open-perapera-db.ts` — PeraperaSchema / `createPeraperaDbHandle` / `toPersistenceError` を切り出し、SessionStore と Repository 間で共有
- `transcript-stream-assembler.ts` — 行ロー → `TranscriptStream` 集約組立ロジックの共有
- `IndexedDbSessionStore` は public API を変更せず内部リファクタのみ

### Phase 4 Relay API 内訳 (PR #27〜#43, 完了 2026-04-22)

**全 23 IMPL タスク 完了:**

- IMPL-400 `RelaySession` 集約 + 値オブジェクト + 状態機械 (PR #27)
- IMPL-401 `IssueStreamTokenUseCase` (stateless 化、PR #30 で session repository 削除)
- IMPL-402 `RelayAudioFrameUseCase` (audio.frame → STT dispatch, PR #40)
- IMPL-403 `RouteTranscriptToTranslationUseCase` (transcript.final → translation, PR #40)
- IMPL-411 `POST /sessions` HTTP route + error mapper (PR #28)
- IMPL-412 `GET /sessions/:id` 状態参照 (stateless, PR #39)
- IMPL-420 WebSocket `/relay` 接続 + stream token verify (PR #32)
- IMPL-421 client event parse + dispatch 完全版 (PR #33, #43)
- IMPL-422 server event envelopes 完全版 (transcript.\* / translation.final 含む, PR #33, #43)
- IMPL-423 heartbeat-based disconnect detection (PR #34)
- IMPL-430 HTTP access token Bearer 認証 (PR #35)
- IMPL-431 `JwtSigner` + `JwtVerifier` (jose HS256) + port 定義 (PR #29, #31)
- IMPL-432 `@fastify/rate-limit` 設定 (PR #38)
- IMPL-433 `@fastify/cors` 設定 (PR #38)
- IMPL-434 `@fastify/helmet` 適用 (PR #38)
- IMPL-440 `SttPort` interface (PR #40)
- IMPL-441 `TranslationPort` interface (PR #40)
- IMPL-442 `MockSttProvider` (tests/support/mock 配置, PR #42)
- IMPL-443 `MockTranslationProvider` (tests/support/mock 配置, PR #42)
- IMPL-444 Deepgram STT provider (real adapter, `wss://api.deepgram.com`, PR #42)
- IMPL-445 DeepL translation provider (real adapter, fetch 実装, PR #42)
- IMPL-446 サーキットブレーカー / リトライ / タイムアウト 設定 (PR #41)
- IMPL-450 `pino` redact 検証テスト (PR #37)
- IMPL-451 構造化ログ (`sessionId` / `requestId` 必須, PR #37)

## 3. 実装原則 (本ロードマップで再確認)

### 3.1 本番実装で Mock / in-memory リポジトリを使わない

Cloud Run 複数インスタンス要件 ([`infrastructure-design.md` §7](../08-infrastructure-design/infrastructure-design.md)) との両立のため、production entrypoint では次のいずれかの実装を **必須 DI** で注入する:

- 実プロバイダ / 実ストア (例: jose JWT signer / verifier、Static access token verifier)
- `stateless` 設計で中央ストア自体を不要にする (例: PR #30 の JWT claims 埋め込み)

**避けるべきパターン** (過去の失敗例とその修正):

| 誤りパターン                                        | 正しい対応                                          |
| --------------------------------------------------- | --------------------------------------------------- |
| default 引数で mock が漏れる                        | 必須 DI (default なし) + production factory を明示  |
| `in-memory session repository` を production で使用 | stateless JWT-only 化 (PR #30)                      |
| Mock provider を production 既定にする              | env 変数で明示選択、未設定なら fail-fast で `throw` |

### 3.2 Provider モード切替

`IMPL-440〜445` では次の方針を採る:

- `SttPort` / `TranslationPort` の mock と実実装は**同格の infrastructure 実装**として存在
- production entrypoint (`server.ts`) は env 変数 (例: `STT_PROVIDER=mock|streaming`) で選択
- `production` で `mock` を選んだ場合は **起動時に warning log + メトリクス**、または明示フラグで許容
- 実プロバイダ未実装のまま production に出る場合は `throw` (fail-fast)

### 3.3 シークレット管理

- 全 secret は env 変数由来。Git 管理しない
- env 変数欠落は factory で fail-fast (`throw`)
- 起動時の redact テスト (IMPL-450) で secret がログに漏れないことを契約として固定

## 4. 直近の PR 優先順位 (Phase 5 残作業 → Phase 6)

PR 次 #1〜#6 (背景 composition / Popup / SidePanel / Content overlay / Offscreen+Monitor / Design tokens) と
integration gap 埋め (PR #53) が完了し、Phase 5 M2 foundation は揃った。残りは
**audio frame を Relay まで流し切る pipeline** と **実機 smoke 準備**。

### PR (次) #7 — Audio frame pipeline (M)

> `captureOrchestrator.frames` (AudioPreprocessor の 100ms フレーム Stream) を
> `relayGateway.sendAudioFrame` に転送する backend pipeline。start use case で
> subscribe、stop / disconnect で unsubscribe。encoding は `pcm_s16le` mono 16kHz +
> Base64 (API 仕様 §3)。

- 範囲: `application/services/audio-frame-pump.ts` (新規) or
  `relay-session-subscriber.ts` の責務拡張 / `start-source-session-use-case.ts` と
  `stop-source-session-use-case.ts` の配線 / `capture-orchestrator.ts` frame stream
  exposure 確認
- 依存: PR #53 (integration gap 埋め完了), IMPL-303 AudioPreprocessor (Phase 3 完了)
- 検証: vitest で frame stream → sendAudioFrame 変換契約 + back-pressure / frame 欠落時の挙動テスト

### PR (次) #8 — SW → Offscreen audio command 送信 (S)

> Background SW が tab / desktop / mic ソース開始時に Offscreen document へ
> `audio.open` / `audio.close` を `chrome.runtime.sendMessage` で送信し、Offscreen
> 側の AudioContext ホストを駆動する。現状 Offscreen 側 (IMPL-562) は受信できる
> が SW 側送信が未配線。

- 範囲: `application/services/offscreen-command-sender.ts` (新規) +
  use case 配線 (capture connect 直後に audio.open、stop で audio.close)
- 依存: PR (次) #7 (frame pump)
- 検証: runtime message contract テスト (既存 Offscreen 受信契約と往復成立)

### PR (次) #9 — Session recovery on SW restart (M)

> Service Worker は MV3 で 30 秒 idle 後 shutdown される。再起動時に
> `SourceSessionRepository.findActiveSessions` から capturing / transcribing /
> translating の session を読み戻し、subscribe / capture を再開する。
> 設計論点 §10 (Background 多重起動) の確定版。

- 範囲: `composition/extension-composition.ts` 起動時 recovery hook +
  `application/services/session-recovery-service.ts` (新規)
- 依存: PR (次) #7, #8
- 検証: SW 再起動シミュレート (chrome.runtime.onStartup vs onInstalled の分岐)、
  idempotent 性 (既存 active session にも安全)

### PR (次) #10 — WXT zip 配布 smoke (✅ 既達成)

PR #47 時点で `wxt zip` script + CI `build-extension` job の `WXT zip` step +
`extension-zip` artifact upload が既に配線されており、追加実装不要。
本 PR (IMPL-604) で認識を更新し M2 checklist を完了とした。

### PR (次) #11 — Phase 6 Playwright E2E 拡充 (✅ 完了、v0.5.22 で close)

> unpacked 拡張 Chrome を `chromium.launchPersistentContext` でロードし、
> Service Worker + 各 entrypoint (popup / sidepanel / monitor) の React render を確認する
> **page render smoke 4 spec** で端到端の smoke を網羅する。
>
> 1. (済) `smoke.spec.ts` — Service Worker 登録確認 (PR #47 時点で配線)
> 2. (済) `popup.spec.ts` / `sidepanel.spec.ts` — Popup / SidePanel ページの React render 確認 (PR #56, IMPL-604)
> 3. (済) `monitor.spec.ts` — Monitor ページ (web_accessible_resources) の React render 確認 (PR #57, IMPL-605)
> 4. (close → β 手動 QA) `tab-capture-translation.spec.ts` (golden path) — Relay in-process mock + Chrome tabCapture user gesture + provider mock 注入が必要で規模大。現状の smoke + unit test で主要リグレッションは検知済のため MVP スコープ外とし、β 手動 QA で閉じる
> 5. (close → β 手動 QA) `permission-denied.spec.ts` — `chrome.permissions.request` は user gesture 要求 + permission prompt が Playwright 単体では自動化できない。error state UI は `start-session-form.test.tsx` の unit test (`shows an error message when submission fails`) で既にカバー済のため E2E としては再現性が低い

- 範囲: `packages/extension/e2e/specs/` (4 spec で close)
- 依存: なし
- 検証: CI `e2e` job (xvfb-run via Playwright) で全 spec pass

### PR (次) #12 — Audio data routing (AudioWorklet + Offscreen MediaStream) (L, 規模大)

> Phase 5+ の本丸。MV3 Service Worker は `MediaStream` / `AudioContext` を直接扱えないため、
> capture と前処理を offscreen 側に移し、実 PCM16 フレームを `audioFramePump` 経由で
> Relay まで流す。段階的に進めている:

#### Phase 5+ Step 1: SW → Offscreen audio command sender (✅ 完了, IMPL-606, PR #59)

- `application/services/offscreen-command-sender.ts` — SW → offscreen `audio.open` / `audio.close` / `ping` 送信 service
- `infrastructure/messaging/chrome-runtime-message-bridge.ts` — `chrome.runtime.sendMessage` の port wrap (production adapter)
- start/stop UseCase 配線 + composition wiring
- offscreen 側受信ロジック (IMPL-562) は既に存在するため、**SW → offscreen の往復が成立**

#### Phase 5+ Step 1.5: AudioWorklet processor JS 配置 (✅ 完了, IMPL-607, PR #60)

- `packages/extension/src/public/perapera-audio-processor.js` を追加
- `chrome-mv3/perapera-audio-processor.js` として WXT zip にも含まれる
- 機能: multi-channel mono 化 + 16kHz 再サンプル + 100ms バッファ + Float32→Int16 PCM + base64 → port.postMessage
- まだ呼び出し元なし (next step で offscreen 側 AudioPreprocessor が `audioWorklet.addModule(chrome.runtime.getURL('/perapera-audio-processor.js'))` で読み込む)

#### Phase 5+ Step 1.6: PCM utility extract + unit test (✅ 完了, IMPL-608, PR #61)

- `packages/extension/src/infrastructure/audio/pcm-utils.ts` に worklet と等価な
  pure function (`floatToPcm16` / `int16ToBase64` / `downsampleStep` / `monoMix`) を extract
- 17 tests で Int16 full scale / clamp / base64 round-trip / downsample step / mono mix を検証
- 将来 offscreen 側 AudioPreprocessor や別の tool から再利用可能

#### Phase 5+ Step 2a: TabCaptureApi.getMediaStreamId 追加 (✅ 完了, IMPL-609, PR #62)

- `TabCaptureApi` 型に `getMediaStreamId(options): Promise<string>` を追加
- `defaultTabCaptureApi` に `chrome.tabCapture.getMediaStreamId` の Promise wrap 実装
  (callback + lastError + empty id の防御検査を含む)
- まだ SourceAdapter からは呼ばれない (Step 2b で offscreen 側配線と同時に接続)
- test contract: getMediaStreamId が非空文字列を返すことを assert

#### Phase 5+ Step 2b-1: audio.open message に tabStreamId 追加 (✅ 完了, IMPL-610, PR #63)

- `offscreen-commands.ts` の `audioOpenSchema` / `OffscreenCommand` / `parseOffscreenCommand` に
  optional `tabStreamId: string` field を追加
- `OffscreenCommandSender.openAudioContext` の options に `tabStreamId` を追加
- schema / type / sender / parser の 4 箇所で整合性保証 + 既存 test + 新規 contract test 4 件
- offscreen 側はまだ streamId を参照しない (Step 2b-2 で `getUserMedia` 呼び出し実装)

#### Phase 5+ Step 2b-2a: TabStreamApi port + adapter (✅ 完了, IMPL-611, PR #64)

- `packages/extension/src/infrastructure/audio/tab-stream-api.ts` を新規追加
- `TabStreamApi.acquire(streamId): ResultAsync<MediaStream, DomainError>` port
- `TabStreamFetcher` (低レベル `navigator.mediaDevices.getUserMedia` 抽象) + production `defaultTabStreamFetcher` / `defaultTabStreamApi`
- legacy `chromeMediaSource: 'tab'` / `chromeMediaSourceId` constraint は adapter 内部で構築 (型 assertion 限定使用)
- 4 tests (acquire 成功 / constraints shape / empty streamId reject / getUserMedia reject の invariant-violation 変換)

#### Phase 5+ Step 2b-2b: offscreen-audio-host に TabStreamApi 配線 (✅ 完了, IMPL-612, PR #65)

- `offscreen-audio-host.ts` に optional `tabStreamApi: TabStreamApi` 依存を追加
- `openEntry(sessionId, sampleRateHz, tabStreamId)` で tabStreamId 受信時に
  `TabStreamApi.acquire` を呼び、取得した MediaStream を entry に保持
- `closeEntry` で MediaStream tracks を `stop()` で解放してから AudioContext を close
- race condition guard (acquire 完了前に close が来たら discard + tracks stop)
- `offscreen/main.ts` で `defaultTabStreamApi` を明示注入 (production wiring)
- 4 新規 tests: acquire 呼び出し / close で tracks stop / acquire Err でも AudioContext 維持 /
  tabStreamApi 未注入時の backward-compatible 動作
- `hasStream(sessionId)` API を追加 (test / smoke 用)

#### Phase 5+ Step 2c: SW UseCase で streamId 解決 → offscreen に転送 (✅ 完了, IMPL-613, PR #66)

- 新規 application port: `TabStreamIdResolver.resolve(targetTabId): ResultAsync<string, DomainError>`
- 新規 infrastructure adapter: `createChromeTabStreamIdResolver(tabCaptureApi)` (IMPL-609 の getMediaStreamId を wrap)
- `StartSourceSessionUseCase` に optional `tabStreamIdResolver?` 依存を追加
- granted path で sourceType='tab' + overlayTarget.kind='tab' + tabId あり + resolver 注入済の場合:
  1. `resolver.resolve(overlayTarget.tabId)` で streamId 取得
  2. 取得成功: `offscreenCommandSender.openAudioContext(sessionId, { tabStreamId })` に乗せる
  3. 失敗: warn して streamId なしで openAudioContext を継続 (後方互換)
- composition で `createChromeTabStreamIdResolver(ports.tabCaptureApi)` を注入
- 既存 test mock に resolver を追加 + 新規 contract (resolve 呼び出し + tabStreamId 付き openAudioContext)

#### Phase 5+ Step 2d-1: offscreen-audio-host で AudioWorklet module 読込 (✅ 完了, IMPL-614, PR #67)

- `OffscreenAudioHostDependencies` に optional `workletModuleUrl` を追加
- `openEntry` 時に `context.audioWorklet.addModule(workletModuleUrl)` を呼び出し、成功/失敗をログ
- `offscreen/main.ts` で `chrome.runtime.getURL('/perapera-audio-processor.js')` を注入
- 3 新規 tests (addModule 呼び出し / rejection で warn + context 維持 / workletModuleUrl 未注入で skip)
- 次の Step 2d-2 で MediaStream と AudioWorkletNode を接続 (MediaStreamAudioSourceNode 作成)

#### Phase 5+ Step 2d-2a: WorkletNodeFactory port + adapter (✅ 完了, IMPL-615, PR #68)

- 新規 `packages/extension/src/infrastructure/audio/worklet-node-factory.ts`
- `AudioWorkletNodeLike` 型 (port.onmessage / connect / disconnect の minimal contract)
- `WorkletNodeFactory = (context, processorName) => AudioWorkletNodeLike` port
- `defaultWorkletNodeFactory` — `new AudioWorkletNode(context, processorName)` を wrap (production)
- 3 unit tests (factory surface / port onmessage 代入可能 / disconnect 呼び出し)
- 本 PR 時点では offscreen-audio-host からは呼ばれない (Step 2d-2b で MediaStream 接続と同時に配線)

#### Phase 5+ Step 2d-2b: offscreen-audio-host で MediaStream + AudioWorkletNode 接続 (✅ 完了, IMPL-616, 本 PR)

- `offscreen-audio-host.ts` に optional `workletNodeFactory` / `workletProcessorName` 依存追加
- MediaStream 取得 + addModule 完了を Promise で同期 (addModule 失敗時は false 返して unhandled rejection 回避)
- `context.createMediaStreamSource(mediaStream)` で SourceNode、`workletNodeFactory(context, 'perapera-audio-processor')` で WorkletNode を作成し、`source.connect(worklet)` で接続
- close 時に source / worklet の disconnect → tracks stop → context close を順次実行
- `hasWorkletConnected(sessionId)` API 追加 (test / smoke 用)
- `offscreen/main.ts` で `defaultWorkletNodeFactory` を注入 (production wiring)
- 2 新規 tests (MediaStream + WorkletNode 接続 / close で disconnect)
- 残 Step 2d-3: worklet port.onmessage で frame を受信 → chrome.runtime.sendMessage で SW へ転送

#### Phase 5+ Step 2d-3: worklet port.onmessage で frame 受信 + SW 転送 (✅ 完了, IMPL-617, PR #70)

- `AudioWorkletNodeLike.port` を mutable に (port 自体は readonly、`port.onmessage` は代入可)
- `OffscreenAudioHostDependencies` に optional `onAudioFrame(sessionId, data)` callback を追加
- `connectWorklet` で worklet を接続した直後に `workletNode.port.onmessage = (event) => onAudioFrame(sessionId, event.data)` を設定
- callback throw を try/catch で吸収 (listener は外れない)
- `offscreen/main.ts` で `chrome.runtime.sendMessage({ type: 'audio.frame.forward', sessionIdentifier, data })` に転送する callback を注入
- 2 新規 tests (frame forward / callback throw catching)
- 残 Step 2d-4: SW で `audio.frame.forward` を受信 → audioFramePump に流す receiver を実装

#### Phase 5+ Step 2d-4: SW で audio.frame.forward 受信 → relayGateway.sendAudioFrame (✅ 完了, IMPL-618, 本 PR)

- 新規 `application/services/audio-frame-forward-receiver.ts`
- zod schema で `{ type: 'audio.frame.forward', sessionIdentifier, data: { pcm16Base64, sequenceNumber, ... } }` を validate
- parse 成功 → `AudioFrameEnvelope` に変換 → `relayGateway.sendAudioFrame(envelope)` を直接呼ぶ
- 非該当 message は silent ignore、malformed は ignore + sendAudioFrame 呼ばず
- composition: `audioFrameForwardReceiver` を `ExtensionApp` に公開
- `background.ts` の `chrome.runtime.onMessage` listener で `app.audioFrameForwardReceiver.receive(message)` を先に呼び、続けて既存 `dispatch` (silent ignore で他 message type と共存)
- 10 unit tests + composition smoke

**Phase 5+ 完了**: SW → offscreen の `audio.open` (streamId 付き) → offscreen で MediaStream 取得 + AudioWorkletNode 接続 → worklet processor が 100ms PCM16 フレーム生成 → port.onmessage で offscreen 受信 → `chrome.runtime.sendMessage('audio.frame.forward', ...)` で SW へ → `audioFrameForwardReceiver` が `relayGateway.sendAudioFrame` に流す。**実 audio data が Relay API まで到達可能**

#### Phase 5+ Step 2: Offscreen MediaStream 受け取り + AudioPreprocessor 移管 (未着手, 規模大)

- **新規**: `packages/extension/public/audio-worklet.js` (mono 化 + 16kHz 再サンプル + 100ms バッファ → postMessage)
- **新規**: `infrastructure/audio/offscreen-audio-preprocessor.ts` — offscreen 側で `getUserMedia({chromeMediaSource: 'tab'})` + AudioWorklet 起動 + 配信
- **改修**: `infrastructure/capture/tab-capture-source-adapter.ts` — `chrome.tabCapture.getMediaStreamId({targetTabId})` を返す形に変更
- **改修**: `entrypoints/offscreen/main.ts` — audio.open ハンドラで MediaStream + Worklet を起動、frame を SW に postMessage
- **検証**: vitest + 手動 unpacked smoke
- **複雑性**: Plan mode で MV3 制約・MediaStream 受け渡し方式・worklet ビルド設定を慎重に設計する必要

## 5. Phase 4 完了基準 (M1) — 2026-04-22 達成

- [x] Phase 4 全 IMPL 完了 (Task.md §6.1〜6.6)
- [x] `pnpm --filter @perapera/relay-api test` で全 184 テスト green
- [x] `app.inject()` / mock WS client での API 仕様書 endpoint / event 契約テスト
- [ ] 性能テスト (k6 / TST-NF-004) で SLO (WebSocket 3000ms / STT 1000ms / 翻訳 800ms) を確認 — Phase 6 へ
- [ ] Docker image ビルド + Cloud Run local emulator で起動確認 — Phase 7 へ

## 6. Phase 5 拡張 presentation 層 (M2 ✅ 達成)

PR #45 で domain repository adapter が揃ったため、Background composition root から
全 infrastructure を DI 注入可能になった。本 Phase で順次実装した 8 項目 + 拡張作業:

**マイルストン (M2)** — `wxt dev` で unpacked 拡張起動 → 手動で tab / mic / desktop ソース作成 → 翻訳オーバーレイが描画される (実 audio data なしのフレーム接続まで):

1. [x] Background service worker: `SessionCommandService` 配線 (PR #47)
2. [x] Popup UI: ソース追加・開始・設定 (PR #48)
3. [x] Side Panel UI: アクティブセッション一覧・停止・エクスポート (PR #49)
4. [x] Content Script: `ContentScriptOverlayPresenter` の対象ページ注入 (PR #50)
5. [x] Offscreen document: AudioContext ホスト + ライフサイクル配線 (PR #51, #53)
6. [x] Monitor page: タブ以外のソース用 overlay 表示 (PR #51)
7. [x] Design system tokens / fonts (PR #52)
8. [x] WXT バンドル・zip 出力 (PR #47 で `wxt zip` script + CI artifact upload を配線済、本 PR で進捗認識を更新)

**Phase 5 integration 追加達成 (PR #53, IMPL-600/601)**:

- `relayGateway.subscribe` → `SessionCommandService.handleRelayEvent` 接続 (`RelaySessionSubscriber` application service)
- `captureOrchestrator.connect` を start UseCase で呼び出し、`relaySessionSubscriber.start` と合わせて配線
- SW 起動時に `chrome.offscreen.createDocument` を ensure (`OffscreenLifecycle` helper)

**Phase 5 拡張作業 (PR #54〜#57)**:

- [x] IMPL-602 Audio frame pipeline: `captureOrchestrator.frames` → `relayGateway.sendAudioFrame` (PR #54)
- [x] IMPL-603 Orphan session cleanup on SW restart: `stopSourceSession` で全 active を stopped 化 (PR #55)
- [x] WXT zip 配布 smoke (PR #47 時点で `wxt zip` + CI extension-zip artifact 配線済、PR #56 で認識更新)
- [x] IMPL-604 popup/sidepanel page render smoke E2E (PR #56)
- [x] IMPL-605 monitor page render smoke E2E (PR #57)

**Phase 5 完了**: 全 UI 層 + integration 配線 + frame pump 骨組み + page render smoke E2E が揃った。

**Phase 5+ (Audio data routing) として分離した残作業** — §4 PR 次 #12 で扱う:

- AudioWorklet 実装 (`audio-worklet.js`) で `MediaStream` → 100ms PCM16 フレーム化
- SW → offscreen `audio.open` / `audio.close` コマンド送信 service
- Offscreen 側 AudioPreprocessor ホスト化 (MediaStream 取得は `chrome.tabCapture.getMediaStreamId` → offscreen 側で `getUserMedia`)
- これで実 audio data が relay まで流れる (現状 stub の empty frame channel を実装に差し替え)

依存: Phase 4 の Relay API が develop 上で動作中 (完了)、Phase 3 infrastructure adapter および Phase 3.5 repository adapter が揃っている (完了)。

## 7. 決定が必要な項目 (blocker candidates)

| ID  | 項目                          | 選択肢                                                     | 状態 / 決定                                       |
| --- | ----------------------------- | ---------------------------------------------------------- | ------------------------------------------------- |
| D1  | STT 実プロバイダ              | Deepgram / Google Cloud Speech-to-Text / OpenAI Realtime   | ✅ **Deepgram** (PR #42 で実装済)                 |
| D2  | 翻訳 実プロバイダ             | DeepL / Google Cloud Translation / OpenAI                  | ✅ **DeepL** (PR #42 で実装済)                    |
| D3  | 本番デプロイ先                | GCP Cloud Run / Fly.io / Render                            | ⚪ **GCP Cloud Run** (設計書前提、Phase 7 で実装) |
| D4  | E2E テストインフラ            | Playwright (拡張 + relay in-process) / Cypress / Puppeteer | ✅ **Playwright** (CLAUDE.md §テスト戦略)         |
| D5  | Chrome Web Store リリース戦略 | 非公開テスト → 限定公開 → 一般公開                         | ⚪ Phase 7 で確定                                 |
| D6  | 本番 HTTPS 証明書             | Cloud Run managed / Let's Encrypt                          | ⚪ Phase 7 デプロイ時                             |
| D7  | モニタリング / APM            | GCP Cloud Monitoring / Datadog / self-host                 | ⚪ Phase 7 運用                                   |

Phase 4 で D1 / D2 を消化、D4 は設計書方針を明示的に確認。残 D3 / D5 / D6 / D7 は Phase 7 で順次決定する。

## 8. Phase 6 検証 (M3 に向けて)

**範囲:**

- IMPL-600 Playwright E2E (拡張 unpacked + Relay mock provider で翻訳ループを閉じる) — ✅ 完了 (page render smoke 4 spec):
  - `smoke.spec.ts` + `popup.spec.ts` + `sidepanel.spec.ts` + `monitor.spec.ts` で chrome-extension URL 直接 load 可能な全 entrypoint を網羅
  - golden path (`tab-capture-translation`) と permission denied は Playwright 自動化の制約 (user gesture / permission prompt / provider mock) が大きく、MVP ROI を満たさないため β 手動 QA へ委譲
  - error state UI の render は既存 `start-session-form.test.tsx` unit test (`shows an error message when submission fails`) で検証済のため E2E で再現する必要性は低い
- IMPL-610 k6 負荷試験 (Relay 同時 3 接続、SLO 計測) — ✅ 完了 (Step 1 + Step 2):
  - Step 1 (PR #74): `perf/scenarios/ws-relay.js` 新規 (`POST /sessions` → WS `/relay` → `session.ready` を同時 3 VU × 30s で計測、SLO: ws_connecting p95 < 3000ms / session_ready_latency p95 < 1000ms / http_req_duration p95 < 500ms)。`create-session.js` path fix、`justfile` / `perf/README.md` 更新
  - Step 2 (本 PR): `.github/workflows/k6-smoke.yml` を新設。weekly monday 11:00 UTC + perf/src 変更 PR + workflow_dispatch で trigger。relay-api を bg 起動し Docker `grafana/k6:latest` で 2 シナリオを実行。provider factory は dummy API key で length check を通過し、scenarios が stream を start しないため real provider に到達しない (mock を production entrypoint に配線せずに済む)
  - 残: `translation-hotpath.js` で transcript.final → translation.final p95 800ms の end-to-end 検証 (別 PR、mock provider を entrypoint 設計として組み込む必要あるため規模中)
- IMPL-620 脅威モデル最終確認 (security-design §3 threat matrix と実装の突き合わせ) — ✅ 完了:
  - `docs/09-security-design/threat-matrix-impl-mapping.md` を新設。STRIDE 6 カテゴリ別に対策実装を IMPL 番号 / ファイルパスで trace。生音声非永続化 / ログマスキング / Bearer + JWT 認証 / レートリミット / circuit breaker / `degraded` 遷移 / MV3 最小権限 / CORS / helmet / dependabot + audit 等の主対策が既に全て実装されていることを確認
  - 3 つの低優先 gap を note として記録: (A) client event sequence 検証未実装 (単一 connection で実害なし), (B) IndexedDB TTL/retention 未実装, (C) 本番 manifest `host_permissions` 切替は Phase 7 IMPL-710 で解決予定
  - Phase 7 残タスクとして TLS / Cloud Run IAM / Secret Manager の運用面を IMPL-700 に委譲
- IMPL-630 `pnpm audit` + dependabot 定期化 — ✅ 完了:
  - `.github/dependabot.yml` — npm / github-actions / docker の 3 ecosystem を weekly monday 09:00 JST で回す。npm は production / development で group 化 (major bump は個別 PR)。target は `develop`
  - `.github/workflows/audit.yml` — `pnpm audit --audit-level moderate` を weekly + 依存ファイル変更 PR + workflow_dispatch で実行
  - `branch-name-check.yml` / `.husky/pre-push` の pattern に `^dependabot/.+$` を OR 追加 (Dependabot 生成 branch の命名規約適合)
  - `package.json > pnpm.overrides` で検出された 8 件の transitive vuln (tar x6 high / vite moderate / esbuild moderate) を patched version (`tar ^7.5.13` / `vite ^6.4.2` / `esbuild ^0.25.0`) に強制し `pnpm audit` 0 件化

## 9. Phase 7 リリース (M4)

**範囲:**

- IMPL-700 Cloud Run デプロイ pipeline (GitHub Actions + `gh` auth) — 🟡 Step 1 完了 (workflow 雛形):
  - `.github/workflows/deploy-relay.yml` 新設。workflow_dispatch only、WIF auth → Artifact Registry push → Cloud Run deploy → `/health` smoke の骨組み
  - GCP vars/secrets が未設定の環境では guard step で no-op (develop merge 後も副作用なし)
  - Step 2 (実運用設定): GCP プロジェクト作成、WIF pool/provider、GAR repository、Service Account 権限、GitHub vars/secrets 配置、main push trigger enable
- IMPL-710 Chrome Web Store manifest + packaging (署名鍵管理) — 🟡 Step 1 + env-driven manifest 完了:
  - Step 1 (PR #65 系): `.github/workflows/publish-extension.yml` 新設。tag push (`v*.*.*`) + workflow_dispatch trigger、wxt build + zip → `chrome-webstore-upload-cli@3` で Chrome Web Store API にアップロード → 任意で publish (target: default / trustedTesters 切替)
  - guard step で `CHROME_EXTENSION_ID` / `CHROME_CLIENT_ID` / `CHROME_CLIENT_SECRET` / `CHROME_REFRESH_TOKEN` が未設定なら skip (develop merge 後も副作用なし)
  - 初期運用 (β / 限定公開) は upload 止まりで手動レビューに委ね、`publish: true` input のときだけ publish step が走る設計
  - env-driven manifest (本 PR): `wxt.config.ts` で `host_permissions` を `PERAPERA_RELAY_API_BASE_URL` の origin から導出するよう変更。dev (localhost) / staging / production を同一 config で切替可能に (§9 threat-matrix note C 解消)。`docs/LOCAL-DEV.md` §5.1 / §8 も env-driven 前提に更新
  - Step 2 (実運用設定): Chrome Developer Dashboard での拡張登録、OAuth2 client + refresh token 取得、GitHub vars/secrets 配置
- IMPL-720 ランブック / インシデント対応手順 — ✅ 完了:
  - `docs/10-operations-design/runbook.md` を新設。6 scenarios の step-by-step playbook: (1) Relay 5xx 急増、(2) WebSocket 切断多発、(3) Provider outage (Deepgram/DeepL)、(4) Cloud Run 前リビジョンへ rollback、(5) Chrome Web Store 緊急 takedown、(6) Secret rotation (access token / JWT secret / provider API key)
  - 単独開発の前提を冒頭に明記 (複数人 escalation fan-out ではなく同一人物のチェックリストとして使う)
  - operations-design §3 / infrastructure-design §4.3 / security-design §5.2 と相互参照
  - TODO 節で Cloud Monitoring alert policy YAML 化 / ポストモーテムテンプレート / on-call 通知チャンネル設定を Phase 7 Step 2 の宿題として列挙
- IMPL-730 ベータ配布 → 一般公開 — ⚪ 未着手

## 10. 直近で閉じたい設計論点 (ロードマップ外の宿題)

- [x] `GET /sessions/:id` の動的 state 返却方針 — **stateless + `state: 'capturing'` 固定** で確定 (PR #39 / IMPL-412)
- [x] `session.stop` / `session.pause` / `session.resume` の server 側振る舞い — PR #43 (IMPL-421/422) で確定。pause/resume は debug log 留め、stop は stream handle close
- [x] Provider サーキットブレーカー発火時のエラー設計 — PR #41 (IMPL-446) で `invariantViolationError` を `session.error` envelope に変換
- [x] Phase 5 開始時の chrome.runtime messaging schema — PR #47 の `runtime-messages.ts` (Zod discriminated union) で Command / Query / Offscreen 各 schema を確定
- [x] Background 多重起動時のセッション継続 — **復元は行わず orphan session を `stopped` 状態に遷移** (IMPL-603)。MV3 の permission / capture 制約により full restore は user gesture が必要で MVP 外。ユーザーは Popup から新規 session 開始
- [ ] AudioWorklet を offscreen document にホストする際の chrome.tabCapture との連携方式 — MVP は SW 側で `AudioPreprocessor` stub (empty frame channel) を保持。実 AudioWorklet + offscreen ホスト化は Phase 5 後続 PR で決定
- [ ] Audio frame 送信失敗時の永続キュー / retry 設計 — 本 PR (IMPL-602) は 1 回 warn + skip。AudioWorklet 実装後の計測結果で再評価
- [ ] DB v2 schema migration の必要性 — MVP で同時 3 session 前提の full-scan が足りない場合のみ実施

## 11. 変更履歴

| バージョン | 日付       | 変更内容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1.0      | 2026-04-21 | 初版作成。Phase 0〜3 完了、Phase 4 進行中時点の整理。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 0.2.0      | 2026-04-22 | Phase 4 完了を反映 (IMPL-400〜451)。直近 PR 優先順位を Phase 5 presentation 層へ更新。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 0.3.0      | 2026-04-22 | Phase 3.5 Domain Repository Adapters (PR #45) 完了を反映。Phase 5 進行中へ遷移、§4 の PR 次優先順位を Background composition 起点に再構成。D1/D2/D4 決定を反映。§10 宿題の 3 件を Phase 4 成果でクローズ、Phase 5 固有の論点 3 件を追加。                                                                                                                                                                                                                                                                                                                                                                  |
| 0.4.0      | 2026-04-22 | Phase 5 拡張 presentation 層の PR #47〜#53 (Background composition / Popup UI / Side Panel UI / Content overlay / Offscreen+Monitor / Design tokens / Phase 5 integration gap 埋め) 完了を反映。Phase 5 進捗 ~85% へ。§4 の PR 次優先順位を残タスク (audio frame pipeline / SW→Offscreen command / session recovery / WXT zip / Phase 6 E2E) に再構成。§6 M2 チェックリスト 7/8 完了、§10 messaging schema 論点をクローズ。                                                                                                                                                                                |
| 0.4.1      | 2026-04-22 | IMPL-602 Audio frame pipeline (PR #54) と IMPL-603 Orphan session cleanup (PR #55) の完了を反映。§10 "Background 多重起動時のセッション継続" 論点を "stopped 遷移" 方針でクローズ (full restore は MV3 permission 制約で MVP 外)。                                                                                                                                                                                                                                                                                                                                                                         |
| 0.4.2      | 2026-04-22 | IMPL-604 で Phase 6 E2E に `popup.spec.ts` / `sidepanel.spec.ts` を追加 (chrome-extension URL 直接 load → React root render 確認)。§6 M2 checklist 8 (WXT zip 配布) は実は PR #47 で達成済だったため認識を更新し M2 完了。Phase 5 残作業は SW→Offscreen audio command + AudioWorklet 実装のみ。                                                                                                                                                                                                                                                                                                            |
| 0.4.3      | 2026-04-22 | IMPL-605 で Phase 6 E2E に `monitor.spec.ts` を追加 (Monitor page も `web_accessible_resources` 経由で render smoke 検証)。これで chrome-extension URL 直接 load 可能な全 entrypoint (popup / sidepanel / monitor) を E2E で網羅。                                                                                                                                                                                                                                                                                                                                                                         |
| 0.5.0      | 2026-04-22 | Phase 5 を **M2 完了** として正式にクローズし、実 audio data routing を **Phase 5+ として分離**。§1 に IMPL 番号運用方針 (Task.md 予約番号との衝突を本 roadmap で吸収する旨) を追記。§4 に PR 次 #12 (AudioWorklet + Offscreen MediaStream) を追加し、Plan mode で慎重設計する旨を明記。§2 状態表に Phase 5+ 行を追加。                                                                                                                                                                                                                                                                                    |
| 0.5.1      | 2026-04-22 | IMPL-606 で Phase 5+ Step 1 (SW → Offscreen audio command sender) を実装。`OffscreenCommandSender` (application service) + `ChromeRuntimeMessageBridge` (infrastructure adapter) + start/stop UseCase 配線 + composition wiring を完了。§2 Phase 5+ ステータスを ⚪ → 🟡 ~30% に更新。Step 2 (AudioWorklet + offscreen MediaStream) は次 PR で続行。                                                                                                                                                                                                                                                       |
| 0.5.2      | 2026-04-22 | IMPL-607 で Phase 5+ Step 1.5 (AudioWorklet processor JS の単体配置) を完了。`packages/extension/src/public/perapera-audio-processor.js` を追加し、WXT build / zip の output ルートに含まれることを確認。worklet 自身は呼び出し元なし (offscreen 側 AudioPreprocessor 移管が次 step)。§2 Phase 5+ ステータスを ~30% → ~50% に更新。eslint config で `src/public/**` を ignore に追加 (W3C worklet global は ts で扱えないため)。                                                                                                                                                                           |
| 0.5.3      | 2026-04-22 | IMPL-608 で Phase 5+ Step 1.6 (PCM utility extract + unit test) を完了。worklet 内 PCM 変換ロジックを `packages/extension/src/infrastructure/audio/pcm-utils.ts` に pure function として extract し、vitest で 17 tests を追加 (Int16 full scale / clamp / base64 round-trip / downsample step / mono mix)。worklet 側コメントで ts 側との同期ルールを明記。                                                                                                                                                                                                                                               |
| 0.5.4      | 2026-04-22 | IMPL-609 で Phase 5+ Step 2a (TabCaptureApi.getMediaStreamId 追加) を完了。`chrome.tabCapture.getMediaStreamId` を Promise wrap した production adapter と test contract を追加。まだ SourceAdapter からは呼ばれない (Step 2b で offscreen 側 MediaStream 受け取り配線と同時に接続)。§2 Phase 5+ ステータスを ~50% → ~60% に更新。                                                                                                                                                                                                                                                                         |
| 0.5.5      | 2026-04-22 | IMPL-610 で Phase 5+ Step 2b-1 (audio.open message に tabStreamId 追加) を完了。`offscreen-commands.ts` の schema / type / parser と `OffscreenCommandSender.openAudioContext` の options に optional `tabStreamId: string` を追加。offscreen 側は受信のみで参照なし (Step 2b-2 で `getUserMedia({chromeMediaSource: 'tab'})` 呼び出しを実装)。§2 Phase 5+ ステータスを ~60% → ~65% に更新。                                                                                                                                                                                                               |
| 0.5.6      | 2026-04-22 | IMPL-611 で Phase 5+ Step 2b-2a (TabStreamApi port + adapter) を完了。`packages/extension/src/infrastructure/audio/tab-stream-api.ts` に `navigator.mediaDevices.getUserMedia({chromeMediaSource: 'tab'})` を wrap した port / production adapter / 4 tests を追加。legacy Chrome constraint (TS 標準型にない) の構築は adapter 内部に閉じる。本 PR 時点では未配線 (Step 2b-2b で offscreen-audio-host に配線)。§2 Phase 5+ を ~65% → ~70% に。                                                                                                                                                            |
| 0.5.7      | 2026-04-22 | IMPL-612 で Phase 5+ Step 2b-2b (offscreen-audio-host に TabStreamApi 配線) を完了。`offscreen-audio-host.ts` に optional `tabStreamApi` 依存を追加し、tabStreamId 付き `audio.open` 受信時に MediaStream を取得・保持、close で tracks stop。`offscreen/main.ts` で `defaultTabStreamApi` を注入。race condition guard + 4 新規 tests (acquire / close tracks stop / acquire Err で context 維持 / tabStreamApi 未注入で後方互換)。§2 Phase 5+ を ~70% → ~80% に。                                                                                                                                        |
| 0.5.8      | 2026-04-22 | IMPL-613 で Phase 5+ Step 2c (SW UseCase で streamId 解決 → offscreen に転送) を完了。`TabStreamIdResolver` port + `createChromeTabStreamIdResolver` adapter を追加し、`StartSourceSessionUseCase` の granted path で tab source のとき `overlayTarget.tabId` を使って streamId を解決、`offscreenCommandSender.openAudioContext` の `tabStreamId` に乗せる。失敗時は warn して streamId なしで継続 (後方互換)。composition で wiring、既存 test mock + 2 新規 contract tests。§2 Phase 5+ を ~80% → ~85% に。                                                                                             |
| 0.5.9      | 2026-04-22 | IMPL-614 で Phase 5+ Step 2d-1 (offscreen-audio-host で AudioWorklet module 読込) を完了。`OffscreenAudioHostDependencies` に optional `workletModuleUrl` を追加し、`audio.open` 受信で `context.audioWorklet.addModule(workletModuleUrl)` を呼ぶ。`offscreen/main.ts` で `chrome.runtime.getURL('/perapera-audio-processor.js')` を注入。3 新規 tests。§2 Phase 5+ を ~85% → ~88% に。                                                                                                                                                                                                                    |
| 0.5.10     | 2026-04-22 | IMPL-615 で Phase 5+ Step 2d-2a (WorkletNodeFactory port + adapter) を完了。`AudioWorkletNodeLike` 型 (port.onmessage / connect / disconnect) + `WorkletNodeFactory` port + `defaultWorkletNodeFactory` (`new AudioWorkletNode` wrap) を追加。3 unit tests。本 PR 時点では offscreen-audio-host から未配線 (Step 2d-2b で MediaStream 接続と同時に接続)。§2 Phase 5+ を ~88% → ~90% に。                                                                                                                                                                                                                   |
| 0.5.11     | 2026-04-22 | IMPL-616 で Phase 5+ Step 2d-2b (offscreen-audio-host で MediaStream + AudioWorkletNode 接続) を完了。`workletNodeFactory` 依存追加、`createMediaStreamSource(mediaStream)` + `workletNodeFactory(ctx, name)` + `source.connect(worklet)` の audio graph 構築を実装。addModule 失敗時は Promise<boolean> で resolve (unhandled rejection 回避)。close 時に disconnect → tracks stop → context close。`offscreen/main.ts` で `defaultWorkletNodeFactory` を注入。2 新規 tests。§2 Phase 5+ を ~90% → ~95% に。                                                                                              |
| 0.5.12     | 2026-04-22 | IMPL-617 で Phase 5+ Step 2d-3 (worklet port.onmessage で frame 受信 + SW 転送) を完了。`AudioWorkletNodeLike.port` を mutable 化し、`OffscreenAudioHost` に `onAudioFrame` callback 依存を追加、`connectWorklet` 内で `port.onmessage` listener を設定。callback throw は try/catch で吸収。`offscreen/main.ts` で `chrome.runtime.sendMessage({type:'audio.frame.forward',...})` を転送として注入。2 新規 tests。§2 Phase 5+ を ~95% → ~98% に。                                                                                                                                                         |
| 0.5.13     | 2026-04-22 | **IMPL-618 で Phase 5+ Step 2d-4 (SW で audio.frame.forward 受信 → relayGateway.sendAudioFrame) を完了、Phase 5+ 完結**。新規 `AudioFrameForwardReceiver` + zod schema validation + `background.ts` onMessage listener で配線。10 unit tests + composition smoke。実 audio data が SW → offscreen → worklet → SW → Relay API までフル接続 (端到端での audio routing foundation 完成)。§2 Phase 5+ を ~98% → ✅ 完了 に。                                                                                                                                                                                   |
| 0.5.14     | 2026-04-22 | IMPL-630 (`pnpm audit` + dependabot 定期化) を完了。`.github/dependabot.yml` で npm / github-actions / docker の 3 ecosystem を weekly monday 09:00 JST・`target-branch: develop` でスケジュール (npm は production/development で group 化、major は個別 PR)。`.github/workflows/audit.yml` で `pnpm audit --audit-level moderate` を weekly + 依存ファイル変更 PR + workflow_dispatch で実行。`branch-name-check.yml` / `.husky/pre-push` に `^dependabot/.+$` を OR 追加し、Dependabot 生成 branch が命名規約 CI を通るようにした。§8 Phase 6 の IMPL-630 を ✅ に更新。                                |
| 0.5.15     | 2026-04-22 | IMPL-630 初回実行で検出された transitive 脆弱性 8 件 (`wxt>giget>tar` x6 high / `vitest>vite` moderate / `vitest>vite>esbuild` moderate) を `package.json > pnpm.overrides` で解消。`tar ^7.5.13` / `vite ^6.4.2` / `esbuild ^0.25.0` に強制し、`pnpm audit --audit-level moderate` が 0 件を返すことを確認。extension (898) / relay-api (184) tests / typecheck / wxt build いずれも override 後に通過。                                                                                                                                                                                                  |
| 0.5.16     | 2026-04-22 | IMPL-610 Step 1 として WebSocket ホットパスの k6 scenario を追加。`perf/scenarios/ws-relay.js` で `POST /sessions` → WS `/relay` → `session.ready` 受信までを同時 3 VU × 30s で計測し、ws_connecting p95 < 3000ms / session_ready_latency p95 < 1000ms / http_req_duration p95 < 500ms を閾値化。既存 `create-session.js` の誤 path (`/api/v1/sessions`) を実装 Fastify route の `/sessions` に合わせて修正、`justfile` / `perf/README.md` も更新。CI 連携と translation-hotpath scenario は後続 PR で扱う。                                                                                               |
| 0.5.17     | 2026-04-22 | IMPL-610 Step 2 として k6 smoke を CI に統合。`.github/workflows/k6-smoke.yml` で weekly monday 11:00 UTC + perf/src 変更 PR + workflow_dispatch を trigger に、relay-api を bg 起動 (build → start) → `/health` 待機 → Docker `grafana/k6:latest` で create-session / ws-relay scenarios 実行 → relay.log artifact を upload。provider factory は length>0 check のみで stream 起動しない限り real provider に到達しないため、dummy API key で初期化し mock を production entrypoint に混ぜない構成。IMPL-610 を ✅ 完了に更新。                                                                          |
| 0.5.18     | 2026-04-22 | IMPL-620 (脅威モデル最終確認) を完了。`docs/09-security-design/threat-matrix-impl-mapping.md` を新設し、security-design §2 STRIDE 6 カテゴリ × 実装 IMPL 番号 / ファイルパスを trace。主対策 (短命 JWT / Bearer + JWT 認証 / 生音声非永続化 / ログマスキング / レートリミット / circuit breaker / degraded / MV3 最小権限 / CORS / helmet / dependabot+audit) は全て実装済を確認。3 件の低優先 gap (client event sequence / IndexedDB TTL / 本番 manifest host_permissions 切替) を note として記録、Phase 7 IMPL-700/710 に委譲。                                                                         |
| 0.5.19     | 2026-04-22 | Phase 7 IMPL-700 Step 1 として Cloud Run deploy workflow 雛形を追加。`.github/workflows/deploy-relay.yml` で workflow_dispatch only trigger、WIF (`google-github-actions/auth@v2` SHA pin) → Artifact Registry push → `deploy-cloudrun@v2` → `/health` smoke の骨組み。GCP vars/secrets 未設定時は guard step で no-op (develop merge 後も副作用なし)。実運用設定 (GCP プロジェクト / WIF / GAR / SA / vars/secrets 配置) は Step 2 へ委譲。§9 Phase 7 の IMPL-700 を 🟡 Step 1 完了に更新。                                                                                                               |
| 0.5.20     | 2026-04-22 | Phase 7 IMPL-710 Step 1 として Chrome Web Store publish workflow 雛形を追加。`.github/workflows/publish-extension.yml` で tag push (`v*.*.*`) + workflow_dispatch trigger、wxt build + zip → `chrome-webstore-upload-cli@3` で upload → `publish: true` のときだけ publish step (target: default / trustedTesters)。guard で `CHROME_EXTENSION_ID` / OAuth2 secrets 未設定時は skip。実運用 (Chrome Developer Dashboard 登録 / refresh token 取得 / vars+secrets 配置 / env 別 manifest 生成) は Step 2 へ委譲。§9 Phase 7 の IMPL-710 を 🟡 Step 1 完了に更新。                                           |
| 0.5.21     | 2026-04-22 | Phase 7 IMPL-720 (ランブック / インシデント対応手順) を完了。`docs/10-operations-design/runbook.md` を新設し、6 scenarios (Relay 5xx 急増 / WS 切断多発 / Provider outage / Cloud Run rollback / Chrome Web Store takedown / Secret rotation) の step-by-step playbook を固定。単独開発前提を冒頭で明記 (複数人 escalation ではなく同一人物のチェックリスト)。operations-design §3 / infrastructure-design §4.3 / security-design §5.2 と相互参照。§9 Phase 7 の IMPL-720 を ✅ に更新。                                                                                                                   |
| 0.5.22     | 2026-04-22 | Phase 6 を正式クローズ。IMPL-600 (Playwright E2E) を page render smoke 4 spec で close 判定。golden path (`tab-capture-translation.spec.ts`) / permission-denied は Playwright 自動化の制約 (user gesture / permission prompt / Relay in-process mock) が MVP ROI を超えるため β 手動 QA へ委譲。error state UI は `start-session-form.test.tsx` unit test で既にカバー済のため E2E 再現不要。§2 現状サマリで Phase 6 を ✅ 完了、§4 PR 次 #11 と §8 IMPL-600 を β 手動 QA 委譲として更新。                                                                                                                |
| 0.5.23     | 2026-04-23 | Phase 7 IMPL-710 の env-driven manifest を実装。`packages/extension/wxt.config.ts` で `host_permissions` を `PERAPERA_RELAY_API_BASE_URL` の origin から導出するよう変更 (`new URL(baseUrl).origin + '/*'`)。dev (localhost:3001) / staging / production を同一 config + env でのみ切替可能に。threat-matrix note C (本番 manifest host_permissions 切替) を IMPL-710 の scope で解消。`docs/LOCAL-DEV.md` §5.1 (要初回パッチ → env export のみ) / §8 トラブルシュート (host_permissions 不足 → env 不一致) も env-driven 前提に更新。§9 Phase 7 IMPL-710 を 🟡 Step 1 + env-driven manifest 完了 に更新。 |
