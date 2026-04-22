---
title: インシデント対応ランブック
version: '0.1.0'
status: in-progress
created: '2026-04-22'
last_updated: '2026-04-22'
author: 'Codex'
---

# インシデント対応ランブック (IMPL-720)

本書は [`operations-design.md`](./operations-design.md) §3 インシデント対応の具体的な手順書 (playbook) として、代表的な 6 scenario の step-by-step を提供する。

**前提** (CLAUDE.md §開発体制): 本プロジェクトは `lihs-ie` 単独開発・運用。以下の「オンコール担当 / 運用責任者 / テックリード」役は全て同一人物が兼務し、複数人前提の escalation fan-out ではなく、同一人物が順に実行するチェックリストとして読む。

## 共通原則

- **まず読み、次に動かす**: 最初の 3 分は `/health` / Cloud Run metrics / 最新 deploy 履歴を読んで影響範囲を特定。コマンドは理解してから実行する (特に destructive 系)。
- **ロールバック優先**: 原因究明前でも利用者影響を止める。Cloud Run traffic split で前リビジョンへ戻すコストは低い。
- **Provider 切替 > 全体停止**: DeepL/Deepgram のどちらかが落ちただけならドメイン側で `degraded` 遷移に委ねられる (SessionStateTransitionPolicy)。無理に停止しない。
- **secret ローテーションは平時にやる**: インシデント中の rotation は orchestration が増えて事故のもとになる。

## Scenario 1 — Relay API 5xx 急増

**検知**: Cloud Monitoring アラート `relay-5xx-rate > 5% (5min)` / 外形監視 `/health` 連続失敗 / pino `level: error` スパイク。

**初動** (15 分以内, SEV1):

1. `gcloud run services describe perapera-relay-api --region=asia-northeast1 --format='value(status.url,spec.template.spec.containers[0].image)'` で最新リビジョン image tag を確認。
2. `gcloud run revisions list --service=perapera-relay-api --region=asia-northeast1 --limit=5` で直近 5 リビジョンと traffic % を表示。
3. 問題が **直近デプロイ直後** に始まった場合: 次セクションの rollback 手順で前リビジョンへ 100% 戻す (コードの bisect より先に止血)。
4. デプロイとは無関係 (古いリビジョンでも発生) の場合: 下記「原因切り分け」へ。

**原因切り分け**:

- **外部 provider**: Deepgram / DeepL のステータスページを確認 → 該当なら Scenario 3 (provider outage) へ分岐。
- **Cloud Run インフラ**: GCP Service Health で `Cloud Run` のインシデントを確認。Google 側問題なら緩和待ち + rate-limit 強化 (`RATE_LIMIT_SESSIONS_PER_MIN` 一時的に下げる) で顧客影響を縮小。
- **コード由来**: `pino` ログで `sessionId` / `requestId` を絞り込み、再現 path を特定。Dockerfile / server.ts 変更がなければ env 変数欠落を疑う (`STREAM_TOKEN_SECRET` < 32 chars / `ACCESS_TOKENS` 未設定 で起動 fail-fast)。

**終息**: 影響期間 / 5xx 件数 / 原因 / 対処 / 恒久対策を postmortem メモに残す (github issue or docs/in-progress/incidents/YYYY-MM-DD.md)。

## Scenario 2 — WebSocket 切断多発 / 接続失敗率急増

**検知**: 拡張側エラーログに `CAPTURE_RELAY_DISCONNECTED` の急増 / Cloud Monitoring アラート `ws-connect-failure-rate > 10% (5min)`。

**初動** (30 分以内, SEV2):

1. Relay API `/health` は OK か? Yes なら WS ハンドシェイク path 単独の問題。
2. `pino` ログで `preValidation` failure 率を確認 (`AuthorizationFailed` / `JwtVerificationError`)。
   - **JWT 期限切れ急増** → `STREAM_TOKEN_TTL_SEC` を一時的に伸ばす (3600 等) + アラート検討。拡張側 clock skew が原因の可能性。
   - **rate limit hit** → `audio.frame` rate limit (10/sec/session) の閾値を下げる不具合がないかコード確認。
3. Fastify 側 heartbeat timeout を見直す (`heartbeatIntervalSec` / `heartbeatTimeoutFactor`)。IMPL-423 の実装を再確認。
4. Cloud Run の `max-instances` が hit していれば scale out。

**緩和**: `SessionStateTransitionPolicy` で `reconnecting` 遷移が自動リトライを試みる (DD-210)。ユーザーには「再接続中」表示。利用者自身の再起動促しは不要。

## Scenario 3 — Provider outage (Deepgram / DeepL)

**検知**: `STT-*` または `TRANSLATION-*` エラーコード急増、circuit breaker open (IMPL-446)。

**初動** (30 分以内, SEV2):

1. provider ステータス:
   - Deepgram: https://status.deepgram.com/
   - DeepL: https://status.deepl.com/
2. **片方だけ OPEN**: 何もしない。`session.error` の `retryable=true` + circuit breaker でフォールバック動作。Translation 単独 outage なら `degraded` 状態遷移で文字起こしのみ継続。
3. **両方 OPEN**: 手動で Relay API の rate-limit を下げ (同時セッション 1 に圧縮) + ユーザーに「プロバイダ障害中」の告知を用意 (Chrome Web Store の description 更新 or 公式 repo README)。
4. 復旧通知が出たら circuit breaker の `halfOpen` → `closed` 遷移を確認 (自動、数分)。

**恒久対策**: D1 / D2 再選定 (複数 provider 並行化) は Phase 7 以降に検討。

## Scenario 4 — Rollback: Cloud Run 前リビジョンへトラフィック戻し

インシデント中の止血 or 計画ロールバック (infrastructure-design §4.3 準拠)。

**前提**: Artifact Registry に前リビジョン image が残っている (Cloud Run 既定の履歴保持で OK)。

**手順**:

1. `gcloud run revisions list --service=perapera-relay-api --region=asia-northeast1 --limit=5` で安定している直前リビジョンを特定 (例: `perapera-relay-api-00023-abc`)。
2. `gcloud run services update-traffic perapera-relay-api --region=asia-northeast1 --to-revisions=<PREVIOUS_REVISION>=100` で 100% 戻す。
3. `/health` を smoke (deploy-relay.yml の smoke step と同等: `for i in $(seq 1 30); do curl -fsS $URL/health && break; sleep 2; done`)。
4. 新リビジョン (`--to-revisions=LATEST=100` で戻す前提) はコード fix 後に再 deploy。`gcloud run services update-traffic` を元に戻せば 100% 新リビジョンに。

**留意**: データ互換が壊れる migration を含む rollback は別手順 (RDBMS 未採用の MVP では該当なし)。

## Scenario 5 — Chrome Web Store 緊急 takedown / ベータ差し戻し

**検知**: 重大な XSS / データ漏洩 / 拡張クラッシュが報告され、publish 済みバージョンの即時停止が必要な場合。

**初動** (SEV1):

1. Chrome Developer Dashboard にログインし、対象拡張の `Store listing` から `Unpublish` を実行 (数分で Store から撤去、既インストール利用者には引き続き動作)。
2. 次バージョンの fix を develop で作成 → `release/x.y.z+1` → tag push で `publish-extension.yml` が走る。
3. 重大度次第では trusted testers channel のみに fix を先行展開 (`publish` input の `target: trustedTesters`)。
4. 公式 repo README / Chrome Web Store description に事象と対応状況を告知。

**仮対処**: Relay API 側で問題のあるエンドポイントを一時的に 503 返却 (feature flag 相当)、または当該バージョンの `client.extensionVersion` を拒否する filter を relay-route preValidation に追加。

## Scenario 6 — Secret rotation (access token / JWT secret / provider API key)

**定常作業**: 月次 / 四半期ごと (operations-design §4.3 準拠)。インシデント時でない限り、**平時の計画作業** として実施。

**access token (`ACCESS_TOKENS`) rotation**:

1. 新 token を 16+ chars で生成 (`openssl rand -hex 16` 等)。
2. `ACCESS_TOKENS` env に **新旧両方** をカンマ区切りで設定 → `gcloud run services update perapera-relay-api --set-env-vars ACCESS_TOKENS=NEW,OLD`。
3. Cloud Run の revision を update → 全トラフィックで新 token が valid に。
4. 拡張側 build で新 token を `PERAPERA_RELAY_ACCESS_TOKEN` に埋め込む → Chrome Web Store 公開。
5. 全利用者の拡張が新 token に切り替わった (推定 1-2 週間) 後、`ACCESS_TOKENS=NEW` のみに update → 旧 token 失効。

**JWT signer secret (`STREAM_TOKEN_SECRET`) rotation**:

- Stream token は短命 (30 分) なので、secret を切り替えると発行済みトークンは全て invalid になる。
- 切替中は session.start 直後のユーザーが一度失敗する想定で、off-peak 時間帯に実施。
- `gcloud run services update ... --set-env-vars STREAM_TOKEN_SECRET=<NEW_32CHARS>` → revision deploy → `/health` smoke。

**provider API key rotation** (Deepgram / DeepL):

- provider コンソールで新 key を発行 → 旧 key は一定期間有効期間延長。
- Cloud Run env `DEEPGRAM_API_KEY` / `DEEPL_API_KEY` を新値に update → revision deploy。
- `pino` ログで stream / 翻訳 API 呼び出しが新 key で成功していることを確認 (revenue 確認サイドもダッシュボードで)。
- 旧 key を provider コンソールで失効。

## 関連リンク

- [`operations-design.md`](./operations-design.md) §3 インシデント対応 (SEV 分類 / エスカレーションフロー)
- [`infrastructure-design.md`](../08-infrastructure-design/infrastructure-design.md) §4.3 ロールバック手順 / §6 バックアップ・リストア
- [`security-design.md`](../09-security-design/security-design.md) §5.2 機密データ取り扱い
- [`threat-matrix-impl-mapping.md`](../09-security-design/threat-matrix-impl-mapping.md) STRIDE × 実装 traceability

## TODO (Phase 7 Step 2 で完了)

- Cloud Monitoring アラートポリシー YAML 化 → `tools/monitoring/alerts.yaml` 等で版管理
- ポストモーテムテンプレート (`docs/in-progress/incidents/template.md`)
- オンコール通知チャンネル (Slack / email) 設定 — 単独運用のため email 1 経路で想定
