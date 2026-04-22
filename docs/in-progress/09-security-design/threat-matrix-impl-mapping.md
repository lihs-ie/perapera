---
title: 脅威モデル × 実装マッピング
version: '0.1.0'
status: in-progress
created: '2026-04-22'
last_updated: '2026-04-22'
author: 'Codex'
---

# 脅威モデル × 実装マッピング (IMPL-620)

本書は [`security-design.md`](./security-design.md) §2 の STRIDE 脅威モデルに対する対策実装を、実装 IMPL 番号 / ファイルパスの粒度で traceability として固定するものである。

Phase 4 完了後の相対位置: Relay API 側の認証・認可・レートリミット・ログマスキングは全て実装済。拡張側 UI / messaging / 永続化も Phase 5 / Phase 5+ で整備済。本書では各対策が実際にコードで閉じていることを確認し、gap があれば note として記録する。

## 1. Spoofing（なりすまし）

| 対策                   | 実装                                                                                                                                                                                                     | 状態                               |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 短命 `streamToken`     | `createIssueStreamTokenUseCase` (PR #30, stateless) で JWT exp claim を TTL 1800s 既定で発行 (`server.ts` L121)。`createJoseJwtSigner` が `jose` の `SignJWT().setExpirationTime` で署名 (IMPL-431)      | ✅ 実装済                          |
| HTTP Bearer 認証       | `createBearerAuthPreHandler` (IMPL-430) が `AccessTokenVerifier` でチェック、`createStaticAccessTokenVerifier` は 16+ chars の comma-separated access token を env `ACCESS_TOKENS` から受ける            | ✅ 実装済                          |
| WebSocket stream token | `/relay` preValidation で `authorizeRelayUpgrade` が `JwtVerifier` 経由で JWT を verify (relay-route.ts L228-244)。`sessionIdQuery` と token `sub` claim の突合も実施 (get-session.ts L62-73 と同じ原則) | ✅ 実装済                          |
| トークン失効時刻検証   | `jose.jwtVerify` で exp claim が自動検証され、期限切れは `JwtVerificationError` → 401                                                                                                                    | ✅ 実装済                          |
| TLS 必須               | Cloud Run managed TLS (Phase 7 で配線、`infrastructure-design.md` §7)。dev では HTTP のみ                                                                                                                | ⚪ Phase 7 で完了予定 (設計書通り) |

## 2. Tampering（改ざん）

| 対策                              | 実装                                                                                                                                                                                              | 状態      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| JSON スキーマ検証 (HTTP)          | `fastify-type-provider-zod` + `issue-stream-token-use-case.ts` 内 Zod schema (sourceType / 言語コード / overlayTarget / client) で parse                                                          | ✅ 実装済 |
| JSON スキーマ検証 (WS client)     | `client-events.ts` の `clientEventSchema` (Zod discriminated union) で parse (IMPL-421)                                                                                                           | ✅ 実装済 |
| JSON スキーマ検証 (WS server out) | `server-events.ts` で全 envelope (session.ready / session.open / transcript.\* / translation.final / session.error / session.pong) の型安全な builder (IMPL-422)                                  | ✅ 実装済 |
| 拡張内 messaging schema           | `runtime-messages.ts` の Zod discriminated union (PR #47)。`chrome.runtime.onMessage` の dispatcher 側で parse し、send 側 (Popup `BackgroundClient` / `ChromeRuntimeMessageBridge`) は serialize | ✅ 実装済 |
| 音声フレーム上限サイズ            | `audio-frame-forward-receiver.ts` の zod schema (`audioFrameDataSchema`) で `pcm16Base64` length 制限 + Relay 側 `audio.frame` rate limit 10/秒/セッション                                        | ✅ 実装済 |
| `sessionId` 整合性                | `/relay` preValidation で JWT `sub` claim と `sessionId` query の突合、client event の `sessionId` field は Zod で必須                                                                            | ✅ 実装済 |
| `sequence` 単調増加保証           | server events は `createSequencer()` で発行 (relay-route.ts L255)。client event 側の sequence は現状 server 側で検証していない                                                                    | ⚠️ note A |
| 拡張内部メッセージの送信元確認    | `chrome.runtime.onMessage` の sender は chrome 側で enforce される (unpacked extension 外からは届かない)。web_accessible_resources の monitor.html は listen-only                                 | ✅ 実装済 |

**note A**: client event の `sequenceNumber` 単調増加は現状サーバーで拒否しない (ベストエフォート順序保存)。MVP は WebSocket 単一 connection 前提で順序が保たれるため実害なし。Phase 7 で multi-connection / 再接続 scenario が増えたら検証を追加する候補。

## 3. Repudiation（否認）

| 対策               | 実装                                                                                                                                           | 状態                          |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| 構造化監査ログ     | `pino` 構造化ログ (IMPL-451) で `sessionId` / `requestId` を必須 field として出力。`loggerOptions.redact` で secret redact                     | ✅ 実装済                     |
| `requestId` 伝播   | Fastify `genReqId` で `req_<ulid>` を生成 (server.ts L51)。`meta.requestId` を全エラーレスポンスに埋める                                       | ✅ 実装済                     |
| 時刻同期           | Cloud Run host 側 NTP (Phase 7 運用)。dev は OS 依存                                                                                           | ⚪ Phase 7 運用前提           |
| 操作イベント永続化 | Relay API の操作は pino 経由で集中ログ基盤へ (Phase 7 で GCP Cloud Logging)。拡張側は IndexedDB に session / transcript / export_record を保存 | ⚪ Phase 7 集中ログ配線で完了 |

## 4. Information Disclosure（情報漏洩）

| 対策                   | 実装                                                                                                                                                                                                                                                            | 状態                  |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| 生音声の非永続化       | `packages/extension/src/infrastructure/storage/` には audio frame を保存する adapter / repository が存在しない (CLAUDE.md §データ保存方針)。IndexedDB schema は `sessions` / `transcript_segments` / `translation_segments` / `export_records` / `sources` のみ | ✅ 実装済             |
| API キーのサーバー管理 | 拡張側に外部プロバイダ API key は保持しない。`RELAY_ACCESS_TOKEN` のみ build 時 define or chrome.storage 経由 (background.ts L20-38)                                                                                                                            | ✅ 実装済             |
| ログマスキング         | `loggerOptions.redact` で `headers.authorization` / `req.headers.authorization` / `*.apiKey` / `transcriptText` / `translationText` を `[REDACTED]` に置換 (IMPL-450 pino redact)                                                                               | ✅ 実装済             |
| TLS 終端               | Cloud Run managed TLS (Phase 7)                                                                                                                                                                                                                                 | ⚪ Phase 7 で完了予定 |
| 保存期間最小化         | CLAUDE.md §データ保存方針: 生音声永続化禁止、部分字幕は短期保持、確定字幕優先。IndexedDB v1 schema で TTL は未実装 — note B                                                                                                                                     | ⚠️ note B             |

**note B**: IndexedDB の保存期間自動削除 (TTL) は MVP schema に含めていない。ユーザー主導の削除 / export 後の clean-up に依存。Phase 7 以降で Retention Policy 実装を検討。

## 5. Denial of Service（サービス拒否）

| 対策                                | 実装                                                                                                                                                               | 状態      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| POST /sessions レートリミット       | `@fastify/rate-limit` で env `RATE_LIMIT_SESSIONS_PER_MIN` (既定 30) を per-user 上限として適用 (IMPL-432, server.ts L184-185)                                     | ✅ 実装済 |
| WebSocket 同時 3 接続               | `issue-stream-token-use-case.ts` の `maxConcurrentSessions: 3` で limits レスポンスに含めて announce。client 側でも `SessionConcurrencyPolicy` (DD-240) で enforce | ✅ 実装済 |
| audio.frame 10/秒/セッション        | relay-route.ts `audioFrameLimit` default `DEFAULT_AUDIO_FRAME_LIMIT_PER_SEC` (=10) で 10/秒を超えるフレームを silently drop + warn                                 | ✅ 実装済 |
| タイムアウト / サーキットブレーカー | `createDeepgramSttProvider` / `createDeepLTranslationProvider` に circuit breaker + retry + timeout ミドルウェアを組み込み (IMPL-446)                              | ✅ 実装済 |
| バックプレッシャー                  | AudioFramePump の `await sendFrame(frame)` で natural slowdown (IMPL-602)。永続キュー挟まない原則 (CLAUDE.md ホットパス)                                           | ✅ 実装済 |
| 劣化運転                            | `degraded` 状態遷移 (DD-210) — 翻訳障害時に文字起こし継続                                                                                                          | ✅ 実装済 |

## 6. Elevation of Privilege（権限昇格）

| 対策                 | 実装                                                                                                                                                                                                   | 状態                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| MV3 最小権限         | `wxt.config.ts` の manifest permissions: `['tabCapture', 'storage', 'sidePanel', 'offscreen', 'scripting', 'activeTab']`。security-design §6.5 と一致。desktopCapture は optional (必要時のみ request) | ✅ 実装済             |
| host_permissions     | `http://localhost:3001/*` のみ (dev 用)。production では `PERAPERA_RELAY_API_BASE_URL` define で置換される構成 (`wxt.config.ts` 配布時更新前提)                                                        | ⚠️ note C             |
| MV3 CSP              | WXT 既定の MV3 manifest CSP `script-src 'self'; object-src 'self'` を継承。`dangerouslySetInnerHTML` は src で未使用                                                                                   | ✅ 実装済             |
| 運用者 RBAC          | Cloud Run IAM (Phase 7)                                                                                                                                                                                | ⚪ Phase 7 で完了予定 |
| Secrets 参照権限分離 | GCP Secret Manager (Phase 7)                                                                                                                                                                           | ⚪ Phase 7 で完了予定 |

**note C**: production manifest の `host_permissions` を release 時に本番 Relay URL に差し替える手順が未確立。Phase 7 の Chrome Web Store packaging (IMPL-710) で wxt の env-specific manifest 生成を config 化する。

## 7. XSS / CORS / Secrets (§6 一般対策)

| 対策                                    | 実装                                                                                                                                                               | 状態      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| React エスケープ / プレーンテキスト描画 | `presentation/atoms` / `molecules` / `organisms` / `templates` は全て JSX 経由で innerHTML を直接触らない。`dangerouslySetInnerHTML` の grep 0 件                  | ✅ 実装済 |
| Content Script Shadow DOM               | `ContentScriptOverlayPresenter` (IMPL-554) が Shadow DOM 内に overlay を描画                                                                                       | ✅ 実装済 |
| CORS 制限                               | `@fastify/cors` で `CORS_ALLOWED_ORIGINS` env を whitelist に (未設定時は `chrome-extension://<32-char-id>` のみ dev friendly 許容 / IMPL-433, server.ts L150-153) | ✅ 実装済 |
| helmet                                  | `@fastify/helmet` 適用 (IMPL-434)                                                                                                                                  | ✅ 実装済 |
| 依存脆弱性監視                          | `.github/dependabot.yml` (weekly) + `.github/workflows/audit.yml` (`pnpm audit --audit-level moderate`, IMPL-630) + `pnpm.overrides` で transitive 脆弱性 0 件化   | ✅ 実装済 |
| Secrets 管理                            | env 変数由来 (server.ts L114-136)。未設定で fail-fast (`STREAM_TOKEN_SECRET` < 32 chars / `ACCESS_TOKENS` 未設定 / `DEEPGRAM_API_KEY` / `DEEPL_API_KEY` 未設定)    | ✅ 実装済 |

## 8. Gap サマリ (残対応)

| Gap                                  | 対象 note | 優先度 | 対応 Phase / PR                                                        |
| ------------------------------------ | --------- | ------ | ---------------------------------------------------------------------- |
| client event sequence 検証           | §2 note A | 低     | Phase 7 以降で必要性評価 (MVP は単一 connection で実害なし)            |
| IndexedDB TTL / retention policy     | §4 note B | 低     | Phase 7 以降。ユーザー主導 clean-up で当面代替                         |
| 本番 manifest host_permissions 切替  | §6 note C | 中     | Phase 7 IMPL-710 Chrome Web Store packaging 時に wxt env manifest 生成 |
| TLS / Cloud Run IAM / Secret Manager | §1/§3/§6  | 高     | Phase 7 IMPL-700 Cloud Run deploy pipeline                             |

Phase 6 時点で security-design §3-§6 の主対策は全て実装済み、残は Phase 7 デプロイ時の運用面 (TLS 終端、IAM、Secret Manager) と低優先 gap のみ。
