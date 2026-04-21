# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

`perapera` は、任意の音声ソース（ブラウザタブ音声、マイク、画面共有音声）に対してリアルタイム文字起こし・翻訳を行い、翻訳結果を Chrome 上の閲覧対象にオーバーレイ表示する Chrome 拡張機能。

**現状**: 本リポジトリには実装コードは存在せず、`docs/in-progress/` 配下に設計文書のみが存在する。実装開始時は設計文書を正とする。

## ドキュメント構造

設計文書は `docs/in-progress/` 配下にあり、章ごとに ID 体系で相互参照されている。新規実装や設計変更時は、関連する章の ID（`REQ-001`、`SD-003`、`DD-210` 等）から辿り整合性を確認する。

| ディレクトリ                            | 内容                                             | 主な ID 体系                        |
| --------------------------------------- | ------------------------------------------------ | ----------------------------------- |
| `01-requirements/`                      | 要件定義書                                       | `REQ-xxx` / `UC-xxx` / `REQ-NF-xxx` |
| `02-system-design/`                     | 基本設計書                                       | `SD-xxx`                            |
| `03-detailed-design/detailed-design.md` | 詳細設計（クラス / シーケンス / 状態遷移）       | `DD-001`〜                          |
| `03-detailed-design/infrastructure.md`  | インフラ層（ポート / アダプタ）                  | `DD-1xx`                            |
| `03-detailed-design/domain.md`          | ドメイン層（集約 / 不変条件 / ドメインサービス） | `DD-2xx`                            |
| `03-detailed-design/use-case.md`        | ユースケース層（Command/Query / DTO）            | `DD-3xx`                            |
| `03-detailed-design/acl.md`             | 腐敗防止層（外部 API 変換）                      | `DD-4xx`                            |
| `04-api-specification/`                 | Relay API 仕様（HTTP + WebSocket）               | `API-xxx` / `EXT-xxx`               |
| `05-database-design/`                   | IndexedDB / chrome.storage.local ストア設計      | `DB-xxx`                            |
| `06-ui-ux-design/`                      | デザインシステム、画面仕様                       | `SCR-xxx`                           |
| `07-test-specification/`                | テスト戦略、テストケース                         | `TST-xxx`                           |
| `08-infrastructure-design/`             | GCP Cloud Run、CI/CD                             | `INF-xxx`                           |
| `09-security-design/`                   | 脅威分析、認証認可、データ保護                   | -                                   |
| `10-operations-design/`                 | SLA/SLO、インシデント対応                        | -                                   |
| `11-persona-design/`                    | 利用者像と文脈                                   | `PER-xxx`                           |

## アーキテクチャの要点

### Chrome 拡張エントリポイント

拡張は `WXT` で統合管理し、役割を以下のように分離する:

- **Popup / Side Panel (React)**: ソース追加、設定変更、状態監視 UI
- **Service Worker**: セッション管理、メッセージ中継、状態遷移の権威
- **Offscreen Document**: DOM / MediaStream を必要とする音声処理ハブ（拡張内に 1 つ）
- **Content Script + Shadow DOM**: 対象タブ上に翻訳オーバーレイを描画（ページ CSS 競合を回避）
- **Unlisted Page (`monitor.html`)**: タブ音声以外（マイク等）のオーバーレイ表示先

### 処理パイプライン

音声ソースごとに独立したパイプラインを持ち、1 ソース障害が他ソースへ波及しない:

```
capture → preprocess (AudioWorklet) → Relay API (WebSocket)
                                           ├─ STT Provider (streaming)
                                           └─ Translation Provider
                ↓
     OverlayPresenter / SidePanel / SessionStore (IndexedDB)
```

同時アクティブセッションは最大 3。`SessionConcurrencyPolicy`（`DD-240`）でドメイン不変条件として強制する。

### レイヤ構成（TypeScript 側）

オニオンアーキテクチャを採用（`domain` ← `application` ← `infrastructure`）。`domain` は外部依存を持たず、`infrastructure` が `domain` のポートを実装する。

**主要ポート → アダプタ**:

| ポート（domain/application） | アダプタ（infrastructure）                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| `SourceAdapter`              | `TabCaptureSourceAdapter` / `UserMediaSourceAdapter` / `DesktopCaptureSourceAdapter` |
| `RelayGateway`               | `RelayWebSocketGatewayAdapter`                                                       |
| `SessionStore`               | `IndexedDbSessionStore`                                                              |
| `SettingsStore`              | `ChromeLocalSettingsStore`                                                           |
| `OverlayPresenter`           | `ContentScriptOverlayPresenter`                                                      |

外部 STT / 翻訳 / 将来の TTS プロバイダは **すべて Relay API 背後の ACL 層で抽象化** し、拡張からベンダー固有 API を直接呼ばない。API キーも拡張に一切保持しない。

### ホットパス最優先原則: 翻訳速度

翻訳速度を最優先とし、ホットパス上で以下を **禁止** する:

- 翻訳ホットパス上に永続キューを挟まない
- 翻訳結果描画前に IndexedDB 書き込み完了を待たない
- 毎セグメントごとに新規 HTTP クライアントを生成しない
- 部分字幕翻訳を既定動作にしない

処理順序は `TranscriptAssembler → OverlayPresenter → SessionStore`。`SessionStore` 失敗時も `OverlayPresenter` の成功結果はロールバックしない（結果整合）。

### 状態機械

`SourceSession` の状態は `SessionStateTransitionPolicy` で検証する:

```
idle → requesting_permission → connecting → capturing → transcribing ⇄ translating
                                                ↓
                                      paused / reconnecting / degraded / error
                                                ↓
                                              stopped
```

`degraded` は翻訳障害時のみ遷移可能（文字起こしは継続）。`stopped` 後の `resume` は不許可。

### エラーコード体系

- `CAPTURE_*`: 音声取得
- `STT_*`: 文字起こし
- `TRANSLATION_*`: 翻訳
- `EXPORT_*`: エクスポート
- `SYSTEM_UNEXPECTED`: 想定外

Relay からのエラーは `session.error` イベントに `retryable` と `fatal` フラグを付与して返す。

## Relay API（バックエンド）

- **実行環境**: Node.js 24.x LTS + Fastify、GCP Cloud Run
- **プロトコル方針**: 制御面は HTTP、音声送信と字幕 / 翻訳イベントは WebSocket
- **認証**: HTTP は長期 Bearer、WebSocket は `POST /sessions` 発行の短命 `streamToken`
- **レート制限**: `POST /sessions` 30/分/利用者、`audio.frame` 10/秒/セッション、WebSocket 同時 3 接続/拡張
- **レイテンシ SLO**: WebSocket 接続 3000ms 以内、STT 初回応答 1000ms 以内、翻訳応答 800ms 以内

## 音声フォーマット規約

Relay API とのやり取りは固定:

- `pcm_s16le` / モノラル / 16kHz / 100ms フレーム
- MVP の転送形式: JSON テキストフレーム + Base64

## データ保存方針

MVP に中央 RDBMS なし。クライアント側のみ:

- **IndexedDB**: `sessions`、`transcript_segments`、`translation_segments`、`export_records`
- **chrome.storage.local**: 既定言語設定、既定オーバーレイ設定（起動時即時復元したい小容量項目）

**保存制約**:

- 生音声は永続保存しない
- 字幕・翻訳の保存は非同期 append-only
- 字幕本文・API キー・`Authorization` ヘッダーを平文ログへ出力しない

## テスト戦略

| レベル      | ツール               | 備考                                           |
| ----------- | -------------------- | ---------------------------------------------- |
| 単体 / 結合 | Vitest (v8 coverage) | Chrome API スタブ、Relay / Provider モック併用 |
| E2E         | Playwright           | unpacked extension を Chromium に読み込む      |
| 性能        | k6                   | Relay API の HTTP / WebSocket 負荷検証         |

**カバレッジ目標**: ステートメント 80%+、ブランチ 70%+、状態遷移 / 入力バリデーション / メッセージ契約 90%+、`degraded` / 再接続 / 権限拒否シナリオは 100% 実行。

CI では外部プロバイダ依存の揺らぎを避けるため、原則モック応答を使用する。

## CI/CD

GitHub Actions で利用する第三者 action は **コミット SHA で pin する**。タグ参照 (`@v4` 等) は作者が後から書き換え可能で供給網攻撃の余地があるため、不変な SHA を使い、human-readable なバージョン情報はコメントに残す:

```yaml
- uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4
```

SHA は最新タグに追従させる。更新は `actrun lint .github/workflows/<file>.yml --update-hash` で自動化する。ローカル CI 検証は `actrun workflow run .github/workflows/ci.yml` で行える（`actrun.toml` に skip 設定済、e2e / docker-relay は step-level `if: ${{ !env.ACTRUN_LOCAL }}` で actrun 時のみ skip）。

## ブランチ保護

GitHub Ruleset で `main` / `develop` を保護し、規約を実体として強制する。設定は `tools/rulesets/*.json` に版管理する:

| Ruleset                      | 対象                           | 主なルール                                                                                                                                                                                                                     |
| ---------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Protect main`               | `refs/heads/main`              | deletion / force push 禁止、linear history 強制、PR 必須、required status check `All Green`、`strict_required_status_checks_policy: true`、review thread resolution 必須                                                       |
| `Protect develop`            | `refs/heads/develop`           | deletion / force push 禁止、PR 必須、required status check `All Green`、`strict_required_status_checks_policy: true`                                                                                                           |
| `Conventional branch naming` | 全ブランチ (main/develop 除く) | `^(feat\|fix\|refactor\|chore\|docs\|test\|perf\|ci\|deps\|infra\|release\|hotfix)/[a-z0-9._-]+$` パターンのみ許可 — **現在は workflow と husky で代替**（Public Personal Repo では `branch_name_pattern` rule が 422 のため） |

**branch 命名の現運用**:

- `.github/workflows/branch-name-check.yml` — push / PR 時に CI で validate、違反は CI fail
- `.husky/pre-push` — ローカル push 前に reject

**bypass**:

- `Protect main`: Repository admin が `bypass_mode: always`（緊急時のみ、通常運用では使用しない）
- `Protect develop`: Repository admin が `bypass_mode: pull_request`（PR 経由でのみ bypass 可）

**更新手順**: `tools/rulesets/<name>.json` を編集 → PR → merge → `gh api --method PUT repos/lihs-ie/perapera/rulesets/<id> --input tools/rulesets/<name>.json` で反映。詳細は `tools/rulesets/README.md`。

## 命名規則（本プロジェクト固有）

グローバル規約（ユーザー `~/.claude/CLAUDE.md`）に加え、本プロジェクトで固有の識別子は以下:

- セッション識別子は `SessionIdentifier`（値オブジェクト、BCP-47 互換言語コード）
- 字幕セグメントは `SegmentIdentifier`、翻訳は `TranslationIdentifier`
- `sourceIdentifier` は `AudioSource` 集約ルート側の識別子。`SourceSession` 側の自己識別子は `sessionIdentifier`（フィールド名は `identifier` ではなく既存仕様に従い `sessionIdentifier` / `sourceIdentifier` を使用）

## 未決事項（実装着手時に利用者と合意する）

設計文書・本ファイル・グローバル規約のいずれにも明示されていない判断事項。勝手に選定せず、判断が必要になった時点で利用者に確認する:

- `Result<T, E>` / `AsyncResult<T, E>` の提供元（`neverthrow` / 自作等）
- ドメインエラー型の細分化粒度と命名階層（`SessionStateTransitionError` 等の例外クラス体系）
- Relay API のロガー選定（字幕本文・API キー・`Authorization` ヘッダーを平文出力しない規約を満たすもの）
- Lint / Format / E2E 配置（ESLint / Prettier / Playwright のモノレポ内配置、ルート集約か各パッケージ配下か）
- `packages/shared` による拡張 ↔ Relay の型共有可否（WebSocket メッセージ契約・識別子型）
- SLO（翻訳応答 800ms）と運用アラート閾値（`translation.final` p95 1500ms 超で Warning）の関係が end-to-end 視点か Relay 単体視点かの確定
- 実装コード未着手時点のリポジトリ構造（単一パッケージ / pnpm workspaces モノレポ、`src/` vs `packages/extension/src/` 等のトップレベル）
- MVP に将来の TTS プロバイダ（`Deepgram Aura-2` / `Google Chirp 3: HD`）を含めるかの判断（設計上はホットパス外の後続拡張として扱われている）

# 開発スタイル

TDD で開発する（探索 → Red → Green → Refactoring）。
KPI やカバレッジ目標が与えられたら、達成するまで試行する。
不明瞭な指示は質問して明確にする。

# コード設計

- 関心の分離を保つ
- 状態とロジックを分離する
- 可読性と保守性を重視する
- コントラクト層（API/型）を厳密に定義し、実装層は再生成可能に保つ
- 静的検査可能なルールはプロンプトではなく、その環境の linter か ast-grep で記述する

# ツール

- タスク: justfile
- Node.js: pnpm, v24+
- E2E: playwright

# 言語

- 公開リポジトリではドキュメントやコミットメッセージを英語で記述する

# 環境

- GitHub: {{ .github_username }}
- リポジトリ: ghq 管理（`~/ghq/github.com/owner/repo`）

# スキル作成

新規 skill を作るとき、配置先を次の指針で決める:

- **project 固有** (`<repo>/.claude/skills/` に置く / 該当 repo の `apm.yml` で配布): 特定 repo のドメイン知識・規約・ファイルレイアウトに依存し、他 repo で使う見込みがない
- **グローバル** (`~/.claude/skills/` 直置き or APM global): 言語・ツール横断、複数 repo で再利用可能、運用ノウハウ
- **判断不能なとき**: ユーザーに「project 固有かグローバルか」を質問してから作成（理由: 後から移動するとパス参照や apm.yml 設定が壊れやすい）

外部公開・他者の repo からも参照される可能性があれば upstream repo に置いて APM 登録、自分環境専用なら chezmoi 管理 → 詳細は `chezmoi-management` skill「APM vs chezmoi の境界」節を参照。
