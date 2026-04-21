---
title: 実装ロードマップ
version: '0.2.0'
status: in-progress
created: '2026-04-21'
last_updated: '2026-04-22'
author: 'Codex'
---

# 実装ロードマップ

## 1. 位置付け

本文書は [`Task.md`](./Task.md) (実装タスクの全量カタログ) を補完する、**前進方向の優先順位付け** である。作業順・直近 PR・未決事項・方針原則をまとめる。カタログと本ロードマップでステータスが食い違った場合は `Task.md` の記述を正とする。

## 2. 現状サマリ (2026-04-22)

| Phase | 範囲                                | 状態      |
| ----- | ----------------------------------- | --------- |
| 0     | 着手前合意 (IMPL-001〜005)          | ✅ 完了   |
| 1     | ドメイン層 (IMPL-101〜153)          | ✅ 完了   |
| 2     | アプリケーション層 (IMPL-200〜230)  | ✅ 完了   |
| 3     | 拡張 infrastructure (IMPL-300〜344) | ✅ 完了   |
| 4     | Relay API (IMPL-400〜451)           | ✅ 完了   |
| 5     | 拡張 presentation 層                | ⚪ 未着手 |
| 6     | E2E / 性能 / 品質検証               | ⚪ 未着手 |
| 7     | リリース / 運用整備                 | ⚪ 未着手 |

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

## 4. 直近の PR 優先順位 (Phase 5 着手時の先頭 5 PR)

Phase 4 が完了したため、次の優先度は Phase 5 拡張 presentation 層への着手となる。WXT entrypoint 配線と UI 実装は Relay API (develop 上で稼働) と連動する。

### PR (次) #1 — WXT 配線 + Background service worker (M)

> `packages/extension/entrypoints/background.ts` を作成し、Phase 3 の `SessionCommandService` / `SessionRegistry` / 全 infrastructure adapter を DI で組み立てる。

- 範囲: entrypoint + composition root + runtime message dispatch
- 依存: Phase 3 完了 (済)、Relay API 稼働 (develop 上に存在)
- 検証: `pnpm --filter @perapera/extension dev` で unpacked 起動 + 手動 smoke

### PR (次) #2 — Popup UI 最小実装 (M)

> ソース追加 (tab / mic / desktop) → 開始 → 停止の単純導線。Atomic Design: atoms + molecules + template。

- 範囲: `entrypoints/popup/` + `src/presentation/popup/` organism / template
- 依存: (次) #1
- 検証: vitest + @testing-library/react で component test

### PR (次) #3 — Side Panel UI (M)

> アクティブセッション一覧 / 状態表示 / 停止 / エクスポート導線。

- 範囲: `entrypoints/sidepanel/` + 対応 presentation 層
- 依存: (次) #1

### PR (次) #4 — Content script overlay (M)

> 対象ページへの `ContentScriptOverlayPresenter` 注入 + Shadow DOM 実装。

- 範囲: `entrypoints/content-scripts/` + injection 条件
- 依存: (次) #1

### PR (次) #5 — Offscreen document + Monitor page (S)

> AudioContext 維持用の offscreen 文書と、タブ以外のソース向け monitor page。

- 範囲: `entrypoints/offscreen.html` + `entrypoints/monitor/`
- 依存: (次) #1

## 5. Phase 4 完了基準 (M1) — 2026-04-22 達成

- [x] Phase 4 全 IMPL 完了 (Task.md §6.1〜6.6)
- [x] `pnpm --filter @perapera/relay-api test` で全 184 テスト green
- [x] `app.inject()` / mock WS client での API 仕様書 endpoint / event 契約テスト
- [ ] 性能テスト (k6 / TST-NF-004) で SLO (WebSocket 3000ms / STT 1000ms / 翻訳 800ms) を確認 — Phase 6 へ
- [ ] Docker image ビルド + Cloud Run local emulator で起動確認 — Phase 7 へ

## 6. Phase 5 拡張 presentation 層 (M2 準備)

Phase 4 完了後に着手。範囲:

- Background service worker: `SessionCommandService` 配線 (Phase 3 の全 infrastructure adapter 注入)
- Popup UI: ソース追加・開始・設定
- Side Panel UI: アクティブセッション一覧・停止・エクスポート
- Content Script: `ContentScriptOverlayPresenter` の対象ページ注入
- Offscreen document: `AudioPreprocessor` のホスト (AudioContext 維持)
- Monitor page: タブ以外のソース用 overlay 表示
- WXT バンドル・zip 出力

依存: Phase 4 の Relay API が動いて連携可能なこと (mock provider で OK)。

## 7. 決定が必要な項目 (blocker candidates)

| ID  | 項目                          | 選択肢                                                       | 影響                              |
| --- | ----------------------------- | ------------------------------------------------------------ | --------------------------------- |
| D1  | STT 実プロバイダ              | Google Cloud Speech-to-Text / OpenAI Realtime / Azure Speech | IMPL-444 ブロック。MVP の翻訳品質 |
| D2  | 翻訳 実プロバイダ             | Google Cloud Translation / DeepL / OpenAI                    | IMPL-445 ブロック                 |
| D3  | 本番デプロイ先                | GCP Cloud Run / Fly.io / Render                              | Phase 7 IMPL-500 以降             |
| D4  | E2E テストインフラ            | Playwright (拡張 + relay in-process) / Cypress / Puppeteer   | Phase 6                           |
| D5  | Chrome Web Store リリース戦略 | 非公開テスト → 限定公開 → 一般公開                           | Phase 7                           |
| D6  | 本番 HTTPS 証明書             | Cloud Run managed / Let's Encrypt                            | デプロイ時                        |
| D7  | モニタリング / APM            | GCP Cloud Monitoring / Datadog / self-host                   | Phase 7 運用                      |

MVP 内で最も影響の大きい決定は D1 (STT) と D2 (翻訳)。いずれも APIキー管理・コスト・レイテンシで評価要。

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

- [ ] `GET /sessions/:id` の動的 state 返却方針を確定 (IMPL-412 着手前)
  - 候補 A: stateless のまま静的メタのみ (`state: 'capturing'` 固定)
  - 候補 B: 接続中インスタンス限定 in-memory を復活 (本ロードマップ §3.1 と整合させる必要)
- [ ] `session.stop` / `session.pause` / `session.resume` の server 側振る舞い確定 (IMPL-421 完成時)
- [ ] Provider サーキットブレーカー発火時の `session.error(retryable, fatal)` 設計 (IMPL-446)

## 11. 変更履歴

| バージョン | 日付       | 変更内容                                              |
| ---------- | ---------- | ----------------------------------------------------- |
| 0.1.0      | 2026-04-21 | 初版作成。Phase 0〜3 完了、Phase 4 進行中時点の整理。 |
