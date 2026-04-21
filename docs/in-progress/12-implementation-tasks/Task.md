---
title: 実装タスク一覧
version: '0.1.0'
status: draft
created: '2026-04-21'
last_updated: '2026-04-21'
author: 'Codex'
---

# 実装タスク一覧

## 1. はじめに

### 1.1 目的

本文書は `perapera` MVP 初回リリースに向けた **実装タスクの順序と完了基準** を定義する。`docs/in-progress/01-11` の設計文書を実体化するための作業ブレイクダウンであり、進捗管理のチェックリストでもある。

### 1.2 対象読者

実装担当（lihs-ie 単独。本プロジェクトの開発体制は `CLAUDE.md` §プロジェクト概要を参照）。

### 1.3 ID 体系

本文書では `IMPL-xxx` を使用し、関連する設計文書の ID（`REQ-xxx` / `SD-xxx` / `DD-xxx` / `TST-xxx`）を相互参照する。

### 1.4 進行原則

- **TDD 厳守**: Red → Green → Refactor。テストを先に書く（`07-test-specification` のカバレッジ目標: ステートメント 80%+ / ブランチ 70%+ / 状態遷移・バリデーション・メッセージ契約 90%+ / `degraded` ・再接続・権限拒否シナリオ 100% 実行）
- **依存方向**: ドメイン → アプリケーション → インフラ → プレゼンテーション。下位 Phase が完了するまで上位 Phase の本格着手を保留
- **ブランチ運用**: `feat/<task-id-or-desc>` を develop から切り、PR で develop に統合（`CLAUDE.md` §ブランチ保護）
- **CI ゲート**: 全 PR で `All Green` 通過が必須
- **未決事項**: `CLAUDE.md` §未決事項の項目は Phase 0 で利用者と合意してから着手

### 1.5 ステータス記法

各タスクの先頭に次のいずれかを付ける:

- `[ ]` — TODO
- `[~]` — IN_PROGRESS
- `[x]` — DONE

---

## 2. Phase 0: 着手前合意

`CLAUDE.md` §未決事項のうち、実装に直接影響する判断を確定する。

| ID       | タスク                                          | 完了基準                                                                                                | 関連                |
| -------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------- |
| IMPL-001 | `Result<T, E>` / `AsyncResult<T, E>` 提供元決定 | `neverthrow` を採用するか自作するか確定し、`packages/*/dependencies` に反映                             | CLAUDE.md §未決事項 |
| IMPL-002 | ドメインエラー型階層方針決定                    | `SessionStateTransitionError` などの命名規則と階層粒度を `domain/shared/errors.ts` に最初の例として実装 | DD-220, DD-241      |
| IMPL-003 | Lint / Format / E2E 配置確定                    | 現状ルート集約 + 各 workspace 継承で問題ないことを確認、または再配置                                    | CLAUDE.md §未決事項 |
| IMPL-004 | `packages/shared` 採否決定                      | 拡張 ↔ Relay の WebSocket メッセージ契約・識別子型を共有するか個別定義するかを確定                      | DD-401, DD-411      |
| IMPL-005 | SLO 視点の確定                                  | 翻訳応答 800ms が end-to-end か Relay 単体かをドキュメント化                                            | API-spec §2.6       |

完了したら Phase 1 へ進む。

---

## 3. Phase 1: ドメイン層 (`packages/extension/src/domain/`)

設計: `docs/in-progress/03-detailed-design/domain.md` (DD-2xx)

### 3.1 値オブジェクト

| ID       | タスク                                          | 関連 DD             | テスト                 |
| -------- | ----------------------------------------------- | ------------------- | ---------------------- |
| IMPL-101 | `SessionIdentifier` (Zod `.brand()` ULID)       | DD-230              | 不正値 reject / 同値性 |
| IMPL-102 | `SourceIdentifier` (Zod `.brand()` ULID)        | DD-231              | 同上                   |
| IMPL-103 | `SegmentIdentifier` / `TranslationIdentifier`   | CLAUDE.md §命名規則 | 同上                   |
| IMPL-104 | `LanguagePair` (BCP-47 検証、source ≠ target)   | DD-232              | 同言語ペア不可         |
| IMPL-105 | `SessionState` (列挙型 11 状態)                 | DD-233              | 未定義状態 reject      |
| IMPL-106 | `OverlaySettings` (透明度 0-1 / 行数 1+)        | DD-234              | 範囲外値 reject        |
| IMPL-107 | `TimestampRange` (start ≤ end)                  | DD-235              | 逆転 reject            |
| IMPL-108 | `SourceType` (`tab` / `microphone` / `desktop`) | —                   | 未定義値 reject        |

### 3.2 集約とエンティティ

| ID       | タスク                            | 関連 DD        | 不変条件                                                                                                                   |
| -------- | --------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| IMPL-110 | `SourceSession` 集約ルート        | DD-210, DD-220 | 状態遷移は state machine 準拠 / 1 セッション 1 sourceIdentifier / `degraded` は翻訳障害時のみ / `stopped` 後 `resume` 不可 |
| IMPL-111 | `TranscriptStream` 集約ルート     | DD-211         | 同 segmentId の確定字幕は 1 回のみ / 翻訳は確定字幕にのみ紐づく / 部分字幕 `revision` は単調増加                           |
| IMPL-112 | `TranscriptSegment` エンティティ  | DD-221         | revision / isFinal の遷移                                                                                                  |
| IMPL-113 | `TranslationSegment` エンティティ | DD-222         | status の遷移                                                                                                              |
| IMPL-114 | `ExtensionProfile` 集約ルート     | DD-212         | 既定値が許容範囲内                                                                                                         |
| IMPL-115 | `ExportRecord` エンティティ       | DD-223         | 形式・含有フラグ整合                                                                                                       |

### 3.3 ドメインサービス

| ID       | タスク                         | 関連 DD | 責務                                      |
| -------- | ------------------------------ | ------- | ----------------------------------------- |
| IMPL-120 | `SessionConcurrencyPolicy`     | DD-240  | 同時 3 セッション上限                     |
| IMPL-121 | `SessionStateTransitionPolicy` | DD-241  | 状態遷移可否判定                          |
| IMPL-122 | `ExportAssemblyService`        | DD-242  | 字幕・翻訳系列を TXT/JSON 用に整形        |
| IMPL-123 | `LanguageRoutingPolicy`        | DD-243  | 自動判定有無 + 既定設定から有効言語を決定 |

### 3.4 ドメインイベント

| ID       | タスク                     | 関連 DD |
| -------- | -------------------------- | ------- |
| IMPL-130 | `SourceSessionStarted`     | DD-250  |
| IMPL-131 | `TranscriptPartialUpdated` | DD-251  |
| IMPL-132 | `TranscriptFinalized`      | DD-252  |
| IMPL-133 | `TranslationCompleted`     | DD-253  |
| IMPL-134 | `SourceSessionDegraded`    | DD-254  |
| IMPL-135 | `SourceSessionStopped`     | DD-255  |

### 3.5 リポジトリインターフェース（ポート）

| ID       | タスク                       | 関連 DD |
| -------- | ---------------------------- | ------- |
| IMPL-140 | `SourceSessionRepository`    | DD-260  |
| IMPL-141 | `TranscriptStreamRepository` | DD-261  |
| IMPL-142 | `ExtensionProfileRepository` | DD-262  |
| IMPL-143 | `ExportRecordRepository`     | DD-263  |

### 3.6 仕様 / ポリシー

| ID       | タスク                                | 関連 DD |
| -------- | ------------------------------------- | ------- |
| IMPL-150 | `ConcurrentSessionLimitSpecification` | DD-270  |
| IMPL-151 | `TranslationAttachmentSpecification`  | DD-271  |
| IMPL-152 | `OverlaySettingsSpecification`        | DD-272  |
| IMPL-153 | `ExportFormatSpecification`           | DD-273  |

**Phase 1 完了基準**: 上記全項目が `pnpm --filter @perapera/extension test:coverage` で 90%+ カバレッジ、ドメイン層は `infrastructure` / `application` / `chrome.*` を import しない。

---

## 4. Phase 2: アプリケーション層 (`packages/extension/src/application/`)

設計: `docs/in-progress/03-detailed-design/use-case.md` (DD-3xx)

### 4.1 出力ポート（ドメイン外の interface 定義）

| ID       | タスク                                          | 関連              |
| -------- | ----------------------------------------------- | ----------------- |
| IMPL-200 | `RelayGateway` ポート                           | DD-401            |
| IMPL-201 | `OverlayPresenter` ポート                       | DD-108            |
| IMPL-202 | `SessionStore` ポート                           | DD-106            |
| IMPL-203 | `SettingsStore` ポート                          | DD-107            |
| IMPL-204 | `SourceAdapter` / `SourceAdapterFactory` ポート | DD-101〜103       |
| IMPL-205 | `AudioPreprocessor` ポート                      | DD-104            |
| IMPL-206 | `PermissionCoordinator` ポート                  | DD-001 (詳細設計) |

### 4.2 UseCase

| ID       | タスク                           | 関連 DD | 種別    |
| -------- | -------------------------------- | ------- | ------- |
| IMPL-210 | `StartSourceSessionUseCase`      | DD-301  | Command |
| IMPL-211 | `GetSessionMonitorStateQuery`    | DD-302  | Query   |
| IMPL-212 | `UpdateSourceSettingsUseCase`    | DD-303  | Command |
| IMPL-213 | `HandleTranscriptPartialUseCase` | DD-304  | Command |
| IMPL-214 | `HandleTranscriptFinalUseCase`   | DD-305  | Command |
| IMPL-215 | `StopSourceSessionUseCase`       | DD-306  | Command |
| IMPL-216 | `ExportSessionResultUseCase`     | DD-307  | Command |

### 4.3 DTO

| ID       | タスク                                        | 関連           |
| -------- | --------------------------------------------- | -------------- |
| IMPL-220 | 入力 DTO 7 種 (`StartSourceSessionInput` 等)  | DTO-I-301〜307 |
| IMPL-221 | 出力 DTO 7 種 (`StartSourceSessionOutput` 等) | DTO-O-301〜307 |

### 4.4 例外変換

| ID       | タスク                            | 関連             |
| -------- | --------------------------------- | ---------------- |
| IMPL-230 | ドメイン例外 → アプリ例外マッパー | use-case.md §9.2 |

**Phase 2 完了基準**: 全 UseCase がドメイン層と出力ポートのみに依存し、`infrastructure` 実装は import しない。各 UseCase に対して happy path / 例外 path のテストが揃う。

---

## 5. Phase 3: インフラ層・拡張側 (`packages/extension/src/infrastructure/`)

設計: `docs/in-progress/03-detailed-design/infrastructure.md` (DD-1xx)

### 5.1 音声取得アダプタ

| ID       | タスク                                                                      | 関連 DD |
| -------- | --------------------------------------------------------------------------- | ------- |
| IMPL-300 | `TabCaptureSourceAdapter` (`chrome.tabCapture`)                             | DD-101  |
| IMPL-301 | `UserMediaSourceAdapter` (`getUserMedia`)                                   | DD-102  |
| IMPL-302 | `DesktopCaptureSourceAdapter` (`chrome.desktopCapture` / `getDisplayMedia`) | DD-103  |
| IMPL-303 | `AudioPreprocessor` (AudioWorklet, モノラル / 16kHz / 100ms)                | DD-104  |

### 5.2 ストレージ

| ID       | タスク                                               | 関連 DD                |
| -------- | ---------------------------------------------------- | ---------------------- |
| IMPL-310 | `IndexedDbSessionStore` (`idb` 利用、4 object store) | DD-106, DB-001〜004    |
| IMPL-311 | `ChromeLocalSettingsStore` (`chrome.storage.local`)  | DD-107, DB-005         |
| IMPL-312 | Data Mapper 実装 (永続モデル ↔ ドメイン)             | infrastructure.md §3.3 |

### 5.3 通信

| ID       | タスク                                                           | 関連 DD        |
| -------- | ---------------------------------------------------------------- | -------------- |
| IMPL-320 | `RelayWebSocketGateway` (永続 WebSocket、再接続、ハートビート)   | DD-105, DD-411 |
| IMPL-321 | `RelayEventMapper` (外部イベント → ドメインイベント)             | DD-411         |
| IMPL-322 | `InMemoryTranslationCache` (TTL 30 秒、ホットパス短期キャッシュ) | DD-133         |

### 5.4 表示

| ID       | タスク                                               | 関連 DD        |
| -------- | ---------------------------------------------------- | -------------- |
| IMPL-330 | `ContentScriptOverlayPresenter` (Shadow DOM + React) | DD-108, DD-114 |

### 5.5 統括

| ID       | タスク                                           | 関連                    |
| -------- | ------------------------------------------------ | ----------------------- |
| IMPL-340 | `SessionCommandService` (詳細設計クラス図の中核) | detailed-design.md §2.1 |
| IMPL-341 | `CaptureOrchestrator` / `SourceAdapterFactory`   | 同上                    |
| IMPL-342 | `SessionRegistry` (メモリ上のセッション正本)     | 同上                    |
| IMPL-343 | `TranscriptAssembler` (部分・確定字幕の整形)     | 同上                    |
| IMPL-344 | `ExportService`                                  | 同上                    |

**Phase 3 完了基準**: ホットパス禁止事項 (`CLAUDE.md` §ホットパス最優先原則) に違反しないことをコードレビューで確認。`infrastructure` 層は対応する domain ポートを実装し、UseCase 層からは具体実装を直接参照しない。

---

## 6. Phase 4: Relay API (`packages/relay-api/src/`)

設計: `docs/in-progress/04-api-specification/api-specification.md` + `docs/in-progress/03-detailed-design/{infrastructure,acl}.md`

### 6.1 ドメイン / アプリケーション

| ID       | タスク                                                        | 関連        |
| -------- | ------------------------------------------------------------- | ----------- |
| IMPL-400 | `Session` 集約 (Relay 側、stream token・状態)                 | DD-210 派生 |
| IMPL-401 | `IssueStreamTokenUseCase`                                     | API-002     |
| IMPL-402 | `RelayAudioFrameUseCase` (WebSocket 受信 → STT/翻訳 dispatch) | API-004     |
| IMPL-403 | `RouteTranscriptToTranslationUseCase`                         | API §6.4    |

### 6.2 HTTP routes

| ID       | タスク                                         | 関連    |
| -------- | ---------------------------------------------- | ------- |
| IMPL-410 | `GET /health` (既に実装済)                     | API-001 |
| IMPL-411 | `POST /sessions` (Zod 検証、stream token 発行) | API-002 |
| IMPL-412 | `GET /sessions/:id` (状態取得)                 | API-003 |

### 6.3 WebSocket

| ID       | タスク                                                                                                                                     | 関連                   |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| IMPL-420 | `GET /relay` 接続確立 (stream token 検証)                                                                                                  | API-004                |
| IMPL-421 | クライアントイベント受信 (`session.start` / `audio.frame` / `pause` / `resume` / `stop` / `ping`)                                          | §6.2                   |
| IMPL-422 | サーバーイベント送信 (`session.ready` / `transcript.*` / `translation.final` / `session.error` / `session.state.changed` / `session.pong`) | §6.3                   |
| IMPL-423 | ハートビート (15 秒間隔)                                                                                                                   | infrastructure.md §4.3 |

### 6.4 認証 / レート制限 / セキュリティ

| ID       | タスク                                                                                   | 関連                    |
| -------- | ---------------------------------------------------------------------------------------- | ----------------------- |
| IMPL-430 | アクセストークン Bearer 検証                                                             | security-design.md §3   |
| IMPL-431 | stream token (JWT, `jose`) 発行・検証                                                    | API §2.3                |
| IMPL-432 | `@fastify/rate-limit` 設定 (`POST /sessions` 30/分、`audio.frame` 10/秒、WS 同時 3 接続) | API §2.4                |
| IMPL-433 | `@fastify/cors` 設定 (拡張 origin 限定)                                                  | security-design.md §6.2 |
| IMPL-434 | `@fastify/helmet` 適用                                                                   | 同上                    |

### 6.5 ACL (外部プロバイダ)

| ID       | タスク                                               | 関連 DD         |
| -------- | ---------------------------------------------------- | --------------- |
| IMPL-440 | `SttPort` interface                                  | DD-402          |
| IMPL-441 | `TranslationPort` interface                          | DD-403          |
| IMPL-442 | `MockSttProvider` (CI / dev 既定)                    | テスト仕様 §3.1 |
| IMPL-443 | `MockTranslationProvider` (同上)                     | 同上            |
| IMPL-444 | `StreamingSttProviderAdapter` (実プロバイダ用、後続) | DD-412          |
| IMPL-445 | `TranslationProviderAdapter` (実プロバイダ用、後続)  | DD-413          |
| IMPL-446 | サーキットブレーカー / リトライ / タイムアウト 設定  | acl.md §6       |

### 6.6 ロギング / 監視

| ID       | タスク                                                              | 関連                  |
| -------- | ------------------------------------------------------------------- | --------------------- |
| IMPL-450 | `pino` redact 検証テスト (字幕本文・API キー・Authorization マスク) | TST-NF-004            |
| IMPL-451 | 構造化ログに `sessionId` / `requestId` を必ず含める                 | system-design.md §9.3 |

**Phase 4 完了基準**: API 仕様書のすべての endpoint / event が動作し、Vitest で `app.inject()` を用いた契約テストが緑。`pnpm --filter @perapera/relay-api test:coverage` で 80%+ カバレッジ。

---

## 7. Phase 5: プレゼンテーション層 (`packages/extension/src/presentation/` + `entrypoints/`)

設計: `docs/in-progress/06-ui-ux-design/ui-ux-design.md`

### 7.1 デザインシステム実装

| ID       | タスク                                                     | 関連     |
| -------- | ---------------------------------------------------------- | -------- |
| IMPL-500 | カラーパレット / タイポグラフィ / スペーシングをトークン化 | UI/UX §3 |
| IMPL-501 | `IBM Plex Sans JP` / `Space Grotesk` フォント読込          | 同 §3.2  |

### 7.2 atoms

| ID       | タスク                                                   | 関連       |
| -------- | -------------------------------------------------------- | ---------- |
| IMPL-510 | `Button` (Primary / Secondary / Ghost / Danger)          | UI/UX §3.4 |
| IMPL-511 | `StatusPill` (Connecting / Capturing / Degraded / Error) | 同上       |
| IMPL-512 | `Toast` (Success / Error / Warning / Info)               | 同上       |

### 7.3 molecules / organisms / templates

| ID       | タスク                                                         | 関連       |
| -------- | -------------------------------------------------------------- | ---------- |
| IMPL-520 | `SourceCard` (Idle / Active / Degraded / Error バリエーション) | SCR-002    |
| IMPL-521 | `TranscriptRow` (Partial / Final / Translation)                | UI/UX §3.4 |
| IMPL-522 | `OverlayPanel` (Compact / Dual-line)                           | SCR-004    |
| IMPL-523 | `PermissionCallout`                                            | UI/UX §3.4 |
| IMPL-524 | `PopupTemplate` (SCR-001)                                      | SCR-001    |
| IMPL-525 | `SidePanelTemplate` (SCR-002)                                  | SCR-002    |
| IMPL-526 | `OverlayTemplate` (SCR-004)                                    | SCR-004    |
| IMPL-527 | `MonitorTemplate` (SCR-005)                                    | SCR-005    |
| IMPL-528 | `SourceSettingsView` (SCR-003)                                 | SCR-003    |

### 7.4 エントリポイント wiring

| ID       | タスク                                                                               | 関連                    |
| -------- | ------------------------------------------------------------------------------------ | ----------------------- |
| IMPL-530 | `popup` エントリ — `PopupTemplate` をマウント、ソース追加 → background へ message    | SCR-001                 |
| IMPL-531 | `sidepanel` エントリ — 状態購読 + 設定変更                                           | SCR-002                 |
| IMPL-532 | `content` エントリ — Shadow DOM に `OverlayTemplate` をマウント                      | SCR-004                 |
| IMPL-533 | `offscreen` エントリ — `AudioPreprocessor` 起動、Relay へ frame 送信                 | infrastructure.md §3    |
| IMPL-534 | `monitor` エントリ — マイク系の専用表示                                              | SCR-005                 |
| IMPL-535 | `background` (service worker) — `SessionCommandService` 配線、メッセージルーティング | detailed-design.md §3.1 |

### 7.5 アクセシビリティ

| ID       | タスク                                      | 関連       |
| -------- | ------------------------------------------- | ---------- |
| IMPL-540 | キーボード操作 (Tab / Enter / Esc)          | UI/UX §7.2 |
| IMPL-541 | `aria-live=polite` で重要状態更新           | 同上       |
| IMPL-542 | コントラスト 4.5:1 以上を Lighthouse で確認 | 同上       |

**Phase 5 完了基準**: WCAG 2.1 AA を Lighthouse 監査で達成。Atomic Design の階層違反 (atoms / molecules で IO を持つなど) が無いことをレビューで確認。

---

## 8. Phase 6: 統合 / E2E / 性能

### 8.1 E2E (Playwright)

| ID       | タスク                                 | 関連    |
| -------- | -------------------------------------- | ------- |
| IMPL-600 | TST-001 (ソース登録・接続)             | TST-001 |
| IMPL-601 | TST-002 (権限拒否)                     | TST-002 |
| IMPL-602 | TST-003 (リアルタイム文字起こし)       | TST-003 |
| IMPL-603 | TST-004 (言語設定 / 自動判定)          | TST-004 |
| IMPL-604 | TST-005 (リアルタイム翻訳)             | TST-005 |
| IMPL-605 | TST-006 (3 ソース同時処理)             | TST-006 |
| IMPL-606 | TST-007 (オーバーレイ表示設定)         | TST-007 |
| IMPL-607 | TST-008 (セッション保存・エクスポート) | TST-008 |
| IMPL-608 | TST-009 (`degraded` / 再接続)          | TST-009 |

### 8.2 性能 (k6)

| ID       | タスク                                | 関連       |
| -------- | ------------------------------------- | ---------- |
| IMPL-620 | TST-NF-001 (部分字幕 p95 2.0s)        | TST-NF-001 |
| IMPL-621 | TST-NF-002 (翻訳字幕 p95 1.5s)        | TST-NF-002 |
| IMPL-622 | TST-NF-003 (3 ソース同時時の性能維持) | TST-NF-003 |
| IMPL-623 | TST-NF-004 (ログマスク検証)           | TST-NF-004 |
| IMPL-624 | TST-NF-005 (権限要求前の用途説明)     | TST-NF-005 |

**Phase 6 完了基準**: 全 E2E テストが ubuntu-latest CI で緑、性能テストの p95 SLO を達成。

---

## 9. Phase 7: リリース準備

| ID       | タスク                                                           | 関連                      |
| -------- | ---------------------------------------------------------------- | ------------------------- |
| IMPL-700 | Privacy Policy / 利用規約ドラフト                                | security-design.md §8     |
| IMPL-701 | Chrome Web Store メタ情報 (アイコン 16/32/48/96/128, screenshot) | UI/UX §3                  |
| IMPL-702 | Cloud Run デプロイ設定 (Terraform / IaC)                         | infrastructure-design.md  |
| IMPL-703 | `.github/workflows/release.yml` の GAR push を有効化             | release.yml の TODO 除去  |
| IMPL-704 | 監視ダッシュボード初期セット                                     | operations-design.md §5.3 |
| IMPL-705 | README 拡充 (利用方法 / 制約 / FAQ)                              | —                         |

**Phase 7 完了基準**: ステージング環境で 1 週間の dogfooding を経て、SEV3 以上の不具合 0 件。

---

## 10. 進捗管理

### 10.1 ブランチ運用

- 各 IMPL ID について `feat/<id>-<short-desc>` を develop から切る (例: `feat/impl-110-source-session`)
- IMPL ID をブランチ名 / コミットメッセージ scope に含めることで PR 一覧から進捗を追跡可能
- 1 PR あたり 1 IMPL ID を原則とする (関連する数件をまとめても可)

### 10.2 コミットメッセージ例

```
feat(domain): IMPL-110 SourceSession aggregate root

- 状態遷移は SessionStateTransitionPolicy に委譲
- pause / resume / markDegraded / stop の Result 戻り値
- 不変条件: 1 sessionIdentifier 1 sourceIdentifier、stopped 後の resume 不可
```

### 10.3 完了の定義 (Definition of Done)

各 IMPL タスクについて以下を満たすこと:

- [ ] 関連する設計文書 ID と整合（実装と設計の差異が出たら設計文書を更新）
- [ ] TDD で実装し、対応するテストが pass
- [ ] カバレッジ目標を満たす (該当 layer / シナリオ別)
- [ ] `pnpm check` (fmt / lint / typecheck / test) 通過
- [ ] `actrun workflow run .github/workflows/ci.yml` 緑 (任意の事前検証)
- [ ] develop に PR を出し、`All Green` が緑になって merge

---

## 11. 関連文書

- 設計文書全 11 章 (`01-requirements/` 〜 `11-persona-design/`)
- `CLAUDE.md` (プロジェクト規約・ホットパス禁止事項・ブランチ保護・命名規則・未決事項)
- `tools/rulesets/README.md` (CI/CD ガード)

---

## 変更履歴

| バージョン | 日付       | 変更者 | 変更内容 |
| ---------- | ---------- | ------ | -------- |
| 0.1.0      | 2026-04-21 | Codex  | 初版作成 |
