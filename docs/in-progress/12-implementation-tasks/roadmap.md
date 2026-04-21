---
title: 実装ロードマップ
version: '0.1.0'
status: in-progress
created: '2026-04-21'
last_updated: '2026-04-21'
author: 'Codex'
---

# 実装ロードマップ

## 1. 位置付け

本文書は [`Task.md`](./Task.md) (実装タスクの全量カタログ) を補完する、**前進方向の優先順位付け** である。作業順・直近 PR・未決事項・方針原則をまとめる。カタログと本ロードマップでステータスが食い違った場合は `Task.md` の記述を正とする。

## 2. 現状サマリ (2026-04-21)

| Phase | 範囲                                | 状態           |
| ----- | ----------------------------------- | -------------- |
| 0     | 着手前合意 (IMPL-001〜005)          | ✅ 完了        |
| 1     | ドメイン層 (IMPL-101〜153)          | ✅ 完了        |
| 2     | アプリケーション層 (IMPL-200〜230)  | ✅ 完了        |
| 3     | 拡張 infrastructure (IMPL-300〜344) | ✅ 完了        |
| 4     | Relay API (IMPL-400〜451)           | 🟡 進行中 ~60% |
| 5     | 拡張 presentation 層                | ⚪ 未着手      |
| 6     | E2E / 性能 / 品質検証               | ⚪ 未着手      |
| 7     | リリース / 運用整備                 | ⚪ 未着手      |

### Phase 4 Relay API 内訳 (PR #27〜#35)

**完了:**

- IMPL-400 `RelaySession` 集約 + 値オブジェクト + 状態機械
- IMPL-401 `IssueStreamTokenUseCase` (stateless 化済、PR #30 で session repository 削除)
- IMPL-411 `POST /sessions` HTTP route + error mapper
- IMPL-420 WebSocket `/relay` 接続 + stream token verify
- IMPL-421 (部分) client event parse + dispatch (`session.ping` → `session.pong`, 他は log stub)
- IMPL-422 (部分) server event envelopes (`session.ready` / `session.pong` / `session.error`)
- IMPL-423 heartbeat-based disconnect detection
- IMPL-430 HTTP access token Bearer 認証
- IMPL-431 `JwtSigner` + `JwtVerifier` (jose HS256) + port 定義

**未着手:**

- IMPL-412 `GET /sessions/:id` 状態参照
- IMPL-421/422 残 client/server events (audio.frame → transcript.\* の実処理)
- IMPL-432 `@fastify/rate-limit` 設定
- IMPL-433 `@fastify/cors` 設定
- IMPL-434 `@fastify/helmet` 適用
- IMPL-440 `SttPort` interface
- IMPL-441 `TranslationPort` interface
- IMPL-442 `MockSttProvider` (CI / dev 既定)
- IMPL-443 `MockTranslationProvider` (CI / dev 既定)
- IMPL-444 `StreamingSttProviderAdapter` (実プロバイダ用、**要プロバイダ選定**)
- IMPL-445 `TranslationProviderAdapter` (実プロバイダ用、**要プロバイダ選定**)
- IMPL-446 サーキットブレーカー / リトライ / タイムアウト設定
- IMPL-450 `pino` redact 検証テスト
- IMPL-451 構造化ログ (`sessionId` / `requestId` 必須)

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

## 4. 直近の PR 優先順位

**次の 5 PR** (優先度順):

### PR (次) #1 — IMPL-450/451 ロギング衛生 (M)

> Security critical。access token / stream token secret / 字幕本文が `pino` redact で必ずマスクされること、全構造化ログに `sessionId` / `requestId` が含まれることを契約化する。

- 範囲: logger.ts redact paths 追加 (`req.headers.authorization`, `streamToken`, `access_token`, `audio.*.payload.audioBase64` 等) + redact 検証 unit テスト
- 依存: なし
- 出力: 両 logger (relay + extension) の整合

### PR (次) #2 — IMPL-432 rate-limit (M)

> `@fastify/rate-limit` を POST /sessions (30/分/access-token) と WebSocket audio.frame (10/秒/session) に適用。

- keygen: access token の SHA-256 prefix (access token 本体をキーにしない)
- 超過時: 429 + `X-RateLimit-*` ヘッダ
- WebSocket audio.frame: route handler 内で in-process バケット (session-scoped)

### PR (次) #3 — IMPL-433/434 CORS + Helmet (S)

> 標準 plugin を適用。CORS は `chrome-extension://` origin のみ許可、Helmet は default ポリシー + CSP 調整。

- `@fastify/cors`: `origin: /^chrome-extension:\/\/[a-p]{32}$/` (MV3 ID 形式)
- `@fastify/helmet`: 標準 + `contentSecurityPolicy` off (拡張は CSP を self 管理)

### PR (次) #4 — IMPL-412 `GET /sessions/:id` (S)

> stateless 前提のため、JWT claims から session メタを復元して返す最小実装。動的 state (`state` / `lastEventAt` / `lastErrorCode`) は未保持のため spec §4.3 の該当フィールドは `null` または静的な `'capturing'` を返す。

- 実質的には stream token (JWT) の verify + claims decode のみ
- 認証: access token Bearer (IMPL-430 再利用)

### PR (次) #5 — IMPL-440/441 SttPort / TranslationPort 定義 (M)

> ACL port を定義するだけのポート宣言 PR。実装は後続。

- `SttPort`: `streamTranscribe(audioFrames: AsyncIterable<PCMFrame>): AsyncIterable<TranscriptEvent>` + キャンセル
- `TranslationPort`: `translate(text, sourceLang, targetLang): ResultAsync<string, DomainError>`

> 以降、`IMPL-442/443` Mock provider → `IMPL-444/445` 実プロバイダ選定 → `IMPL-446` サーキットブレーカー の順で組む。

## 5. Phase 4 完了基準 (M1)

- [ ] Phase 4 全 IMPL 完了 (Task.md §6.1〜6.6)
- [ ] `pnpm --filter @perapera/relay-api test:coverage` で 80%+ カバレッジ
- [ ] `app.inject()` / 実 WS client / app-level integration テストで API 仕様書の全 endpoint / event が動作
- [ ] 性能テスト (k6 / TST-NF-004) で SLO (WebSocket 3000ms / STT 1000ms / 翻訳 800ms) を確認
- [ ] Docker image ビルド + Cloud Run local emulator で起動確認

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
