---
title: 実装ロードマップ
version: '0.4.0'
status: in-progress
created: '2026-04-21'
last_updated: '2026-04-22'
author: 'Codex'
---

# 実装ロードマップ

## 1. 位置付け

本文書は [`Task.md`](./Task.md) (実装タスクの全量カタログ) を補完する、**前進方向の優先順位付け** である。作業順・直近 PR・未決事項・方針原則をまとめる。カタログと本ロードマップでステータスが食い違った場合は `Task.md` の記述を正とする。

## 2. 現状サマリ (2026-04-22)

| Phase | 範囲                                       | 状態                                   |
| ----- | ------------------------------------------ | -------------------------------------- |
| 0     | 着手前合意 (IMPL-001〜005)                 | ✅ 完了                                |
| 1     | ドメイン層 (IMPL-101〜153)                 | ✅ 完了                                |
| 2     | アプリケーション層 (IMPL-200〜230)         | ✅ 完了                                |
| 3     | 拡張 infrastructure (IMPL-300〜344)        | ✅ 完了                                |
| 3.5   | Domain Repository Adapters (IMPL-140〜143) | ✅ 完了 (#45)                          |
| 4     | Relay API (IMPL-400〜451)                  | ✅ 完了                                |
| 5     | 拡張 presentation 層 (IMPL-500〜601)       | 🟡 ~85% (残 audio pipeline / zip 配布) |
| 6     | E2E / 性能 / 品質検証                      | ⚪ 未着手                              |
| 7     | リリース / 運用整備                        | ⚪ 未着手                              |

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

**残タスク** (Phase 5 完了へ):

- Audio frame pipeline (`captureOrchestrator.frames` → `relayGateway.sendAudioFrame` の実データ転送)
- SW → offscreen audio.open / audio.close コマンド送信
- WXT zip 配布 smoke (`pnpm --filter @perapera/extension zip`)
- Session recovery on SW restart (IndexedDB から active session を読み戻して再 subscribe)

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

### PR (次) #10 — WXT zip 配布 smoke (S)

> `pnpm --filter @perapera/extension zip` で Chrome Web Store 提出用 zip を生成し、
> Chrome unpacked でも manifest v3 validation を通す。Phase 6 Playwright の前段。

- 範囲: `wxt.config.ts` zip target + `.output/` 生成物を package scripts に配線 +
  CI job (zip 出力を artifact として upload)
- 依存: PR (次) #7, #8, #9 (起動ループが閉じていること)
- 検証: local で zip 展開 → chrome://extensions に load → service worker ログ確認

### PR (次) #11 — Phase 6 Playwright E2E 最小シナリオ (L)

> unpacked 拡張 + Relay in-process (mock provider) で翻訳ループを閉じる端到端テスト。
> `e2e/flows/tab-capture-translation.spec.ts` から着手し、ゴールデンパス 1 本のみで開始。

- 範囲: `packages/extension/e2e/` + Playwright config + CI workflow
- 依存: PR (次) #10
- 検証: CI で Chrome extension launch + tab audio 注入 + Relay mock で translation event 到達を assert

## 5. Phase 4 完了基準 (M1) — 2026-04-22 達成

- [x] Phase 4 全 IMPL 完了 (Task.md §6.1〜6.6)
- [x] `pnpm --filter @perapera/relay-api test` で全 184 テスト green
- [x] `app.inject()` / mock WS client での API 仕様書 endpoint / event 契約テスト
- [ ] 性能テスト (k6 / TST-NF-004) で SLO (WebSocket 3000ms / STT 1000ms / 翻訳 800ms) を確認 — Phase 6 へ
- [ ] Docker image ビルド + Cloud Run local emulator で起動確認 — Phase 7 へ

## 6. Phase 5 拡張 presentation 層 (M2 進行中)

PR #45 で domain repository adapter が揃ったため、Background composition root から
全 infrastructure を DI 注入可能になった。本 Phase で順次実装する 8 項目の進捗:

**マイルストン (M2)** — `wxt dev` で unpacked 拡張起動 → 手動で tab / mic / desktop ソース作成 → 翻訳オーバーレイが描画される:

1. [x] Background service worker: `SessionCommandService` 配線 (PR #47)
2. [x] Popup UI: ソース追加・開始・設定 (PR #48)
3. [x] Side Panel UI: アクティブセッション一覧・停止・エクスポート (PR #49)
4. [x] Content Script: `ContentScriptOverlayPresenter` の対象ページ注入 (PR #50)
5. [x] Offscreen document: AudioContext ホスト + ライフサイクル配線 (PR #51, #53)
6. [x] Monitor page: タブ以外のソース用 overlay 表示 (PR #51)
7. [x] Design system tokens / fonts (PR #52)
8. [ ] WXT バンドル・zip 出力 (§4 PR 次 #10)

**Phase 5 integration 追加達成 (PR #53, IMPL-600/601)**:

- `relayGateway.subscribe` → `SessionCommandService.handleRelayEvent` 接続 (`RelaySessionSubscriber` application service)
- `captureOrchestrator.connect` を start UseCase で呼び出し、`relaySessionSubscriber.start` と合わせて配線
- SW 起動時に `chrome.offscreen.createDocument` を ensure (`OffscreenLifecycle` helper)

**Phase 5 残タスク (§4 PR 次 #7〜#10)**:

- [ ] IMPL-602 Audio frame pipeline: `captureOrchestrator.frames` → `relayGateway.sendAudioFrame` (本 PR)
- [ ] SW → Offscreen audio.open / audio.close コマンド送信
- [ ] Session recovery on SW restart
- [ ] WXT zip 配布 smoke (Chrome Web Store 提出前提)

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

- IMPL-600 Playwright E2E (拡張 unpacked + Relay mock provider で翻訳ループを閉じる)
- IMPL-610 k6 負荷試験 (Relay 同時 3 接続、SLO 計測)
- IMPL-620 脅威モデル最終確認 (security-design §3 threat matrix と実装の突き合わせ)
- IMPL-630 `pnpm audit` + dependabot 定期化

## 9. Phase 7 リリース (M4)

**範囲:**

- IMPL-700 Cloud Run デプロイ pipeline (GitHub Actions + `gh` auth)
- IMPL-710 Chrome Web Store manifest + packaging (署名鍵管理)
- IMPL-720 ランブック / インシデント対応手順
- IMPL-730 ベータ配布 → 一般公開

## 10. 直近で閉じたい設計論点 (ロードマップ外の宿題)

- [x] `GET /sessions/:id` の動的 state 返却方針 — **stateless + `state: 'capturing'` 固定** で確定 (PR #39 / IMPL-412)
- [x] `session.stop` / `session.pause` / `session.resume` の server 側振る舞い — PR #43 (IMPL-421/422) で確定。pause/resume は debug log 留め、stop は stream handle close
- [x] Provider サーキットブレーカー発火時のエラー設計 — PR #41 (IMPL-446) で `invariantViolationError` を `session.error` envelope に変換
- [x] Phase 5 開始時の chrome.runtime messaging schema — PR #47 の `runtime-messages.ts` (Zod discriminated union) で Command / Query / Offscreen 各 schema を確定
- [ ] Background 多重起動時のセッション継続 — PR #53 で `RelaySessionSubscriber` / `OffscreenLifecycle` を整備したが、SW 再起動時の active session 復元は未実装。§4 PR 次 #9 (Session recovery) で確定
- [ ] AudioWorklet を offscreen document にホストする際の chrome.tabCapture との連携方式 — MVP は SW 側で `AudioPreprocessor` stub (empty frame channel) を保持。実 AudioWorklet + offscreen ホスト化は Phase 5 後続 PR で決定
- [ ] Audio frame 送信失敗時の永続キュー / retry 設計 — 本 PR (IMPL-602) は 1 回 warn + skip。AudioWorklet 実装後の計測結果で再評価
- [ ] DB v2 schema migration の必要性 — MVP で同時 3 session 前提の full-scan が足りない場合のみ実施

## 11. 変更履歴

| バージョン | 日付       | 変更内容                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1.0      | 2026-04-21 | 初版作成。Phase 0〜3 完了、Phase 4 進行中時点の整理。                                                                                                                                                                                                                                                                                                                                                                       |
| 0.2.0      | 2026-04-22 | Phase 4 完了を反映 (IMPL-400〜451)。直近 PR 優先順位を Phase 5 presentation 層へ更新。                                                                                                                                                                                                                                                                                                                                      |
| 0.3.0      | 2026-04-22 | Phase 3.5 Domain Repository Adapters (PR #45) 完了を反映。Phase 5 進行中へ遷移、§4 の PR 次優先順位を Background composition 起点に再構成。D1/D2/D4 決定を反映。§10 宿題の 3 件を Phase 4 成果でクローズ、Phase 5 固有の論点 3 件を追加。                                                                                                                                                                                   |
| 0.4.0      | 2026-04-22 | Phase 5 拡張 presentation 層の PR #47〜#53 (Background composition / Popup UI / Side Panel UI / Content overlay / Offscreen+Monitor / Design tokens / Phase 5 integration gap 埋め) 完了を反映。Phase 5 進捗 ~85% へ。§4 の PR 次優先順位を残タスク (audio frame pipeline / SW→Offscreen command / session recovery / WXT zip / Phase 6 E2E) に再構成。§6 M2 チェックリスト 7/8 完了、§10 messaging schema 論点をクローズ。 |
