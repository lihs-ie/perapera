# ローカル動作確認ガイド

perapera (Chrome 拡張 + Relay API) をローカルで試すための step-by-step。
初回セットアップから「拡張を Chrome に load → 任意のタブの音声を翻訳オーバーレイ表示」まで。

## 1. 前提

| 項目     | バージョン / 注意                                          |
| -------- | ---------------------------------------------------------- |
| OS       | macOS / Linux / Windows (WSL2)                             |
| Node.js  | 24.x LTS (`.nvmrc` に準拠、`nvm use` or `mise use` 推奨)   |
| pnpm     | 10.x (`corepack enable` で自動解決)                        |
| Chrome   | 127+ (MV3 offscreen + sidePanel API が stable な版)        |
| API キー | Deepgram (STT) + DeepL Free or Pro (翻訳) — 後述の取得手順 |

**コスト感**: Deepgram / DeepL は無料枠あり (Deepgram は初回 $200 クレジット、DeepL Free は月 50 万文字)。ローカル動作確認だけなら無料枠で十分。

## 2. リポジトリの取得と依存インストール

```sh
# ghq 利用者
ghq get github.com/lihs-ie/perapera
cd "$(ghq root)/github.com/lihs-ie/perapera"

# そうでなければ
git clone git@github.com:lihs-ie/perapera.git
cd perapera

corepack enable
pnpm install
pnpm --filter @perapera/extension exec wxt prepare
```

## 3. 外部プロバイダの API キー取得

### 3.1 Deepgram (STT)

1. <https://console.deepgram.com/signup> でアカウント作成
2. 左サイドバー「API Keys」→「Create a New API Key」
3. `Name`: `perapera-local`、`Permissions`: `Member` で作成
4. 表示された API キー文字列を控える (再表示不可)

### 3.2 DeepL (翻訳)

1. <https://www.deepl.com/pro-api> から Free プランを選択 (クレカ登録は必要だが Free tier は課金なし)
2. アカウント作成後、<https://www.deepl.com/your-account/keys> にアクセス
3. `Authentication Key for DeepL API` を控える (`:fx` 接尾辞は Free 版の印)

**重要**: これらのキーは `packages/relay-api/.env.local` にのみ置き、拡張側には絶対に含めない (security-design §5.2)。

## 4. Relay API の起動

### 4.1 環境変数ファイルの作成

以下を **そのまま zsh / bash に貼り付けて実行**すると、対話で Deepgram と DeepL の API キーを尋ねられ、残りは自動生成・既定値で埋まった `.env.local` が出来上がる。

```sh
read -rp "Deepgram API key: " DG_KEY
read -rp "DeepL API key:    " DL_KEY

cat > packages/relay-api/.env.local <<EOF
# HS256 JWT 署名鍵 (32+ chars、openssl で自動生成)
STREAM_TOKEN_SECRET=$(openssl rand -hex 32)

# HTTP Bearer アクセストークン (16+ chars、カンマ区切りで複数可)
ACCESS_TOKENS=dev-access-token

# 外部プロバイダ (上で入力した値を埋め込む)
DEEPGRAM_API_KEY=${DG_KEY}
DEEPL_API_KEY=${DL_KEY}

# 任意 (指定なしで default 値が採用される)
STREAM_TOKEN_ISSUER=https://relay.local
STREAM_TOKEN_AUDIENCE=perapera-extension
RELAY_PUBLIC_URL=ws://localhost:3001/relay
STREAM_TOKEN_TTL_SEC=1800
RATE_LIMIT_SESSIONS_PER_MIN=30
DEEPL_BASE_URL=https://api-free.deepl.com

# 拡張からの CORS: 未設定なら chrome-extension://<32chars-id> を全許容 (dev friendly)
# CORS_ALLOWED_ORIGINS=

PORT=3001
HOST=0.0.0.0
EOF

unset DG_KEY DL_KEY
echo "Created packages/relay-api/.env.local"
```

**補足**:

- 入力中に文字を見せたくない場合は `read -rp` を `read -srp` に変える (エコー抑制)。
- 生成後の内容を確認:

  ```sh
  cat packages/relay-api/.env.local
  ```

- 後でキーだけ差し替えたい:

  ```sh
  sed -i.bak "s|^DEEPGRAM_API_KEY=.*|DEEPGRAM_API_KEY=NEW_KEY|" packages/relay-api/.env.local
  ```

### 4.2 dotenv 読み込みで起動

`packages/relay-api` は `dotenv-safe` を依存に持つが、server.ts 側で `dotenv/config` を自動読み込みしていないため、起動時に明示読み込みが必要:

```sh
# 方法 A: env を shell に export してから pnpm dev
set -a
source packages/relay-api/.env.local
set +a
pnpm --filter @perapera/relay-api dev

# 方法 B: dotenv-cli (npx) 経由
npx dotenv-cli -e packages/relay-api/.env.local -- pnpm --filter @perapera/relay-api dev
```

起動に成功すると:

```
{"level":30,"time":...,"pid":...,"hostname":"...","msg":"Server listening at http://0.0.0.0:3001"}
```

疎通確認 (別ターミナル):

```sh
curl -sS http://localhost:3001/health
# => {"status":"ok","uptimeSec":..,"version":"..."}
```

## 5. Chrome 拡張のローカルビルド

### 5.1 拡張側の環境変数配線

`wxt.config.ts` は `PERAPERA_RELAY_API_BASE_URL` と `PERAPERA_RELAY_ACCESS_TOKEN` を build 時に `import.meta.env` へ inject 済 (§IMPL-710)。`host_permissions` も `PERAPERA_RELAY_API_BASE_URL` の origin から自動導出されるので dev / staging / production を同一 config で切替できる。build / dev 起動前に env を export するだけでよい:

```sh
export PERAPERA_RELAY_API_BASE_URL=http://localhost:3001
export PERAPERA_RELAY_ACCESS_TOKEN=dev-access-token
pnpm --filter @perapera/extension dev
```

env を変えたら再 build が必要 (build 時 inline)。本番 build 例:

```sh
export PERAPERA_RELAY_API_BASE_URL=https://relay.example.com
export PERAPERA_RELAY_ACCESS_TOKEN=<production access token>
pnpm --filter @perapera/extension build
# .output/chrome-mv3/manifest.json の host_permissions に
# "https://relay.example.com/*" が記述されていることを確認
```

### 5.2 開発ビルド (watch モード)

```sh
pnpm --filter @perapera/extension dev
```

これで `.output/chrome-mv3/` に unpacked extension がビルドされ、ファイル変更で自動リロードされる。

## 6. Chrome に拡張を load

1. Chrome で `chrome://extensions/` を開く
2. 右上「デベロッパーモード」を ON
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. `packages/extension/.output/chrome-mv3/` ディレクトリを選択
5. 拡張が一覧に「perapera」として表示される。Service Worker のリンクをクリックすると SW DevTools が開く
6. SW コンソールに以下が出ていれば初期化成功:

   ```
   [perapera] background service worker loaded
   ```

   `PERAPERA_RELAY_ACCESS_TOKEN is not configured` warning が出ている場合は 5.1 を見直す。

## 7. 動作確認

### 7.1 タブ音声 (tab capture) の smoke

1. YouTube や任意の音声再生ページを開く
2. 拡張アイコン (ブラウザ右上のツールバー) をクリック → Popup が開く
3. フォームに入力:
   - ソース種別: タブ音声
   - 入力言語: 自動判定 / または明示指定 (`en-US` 等)
   - 翻訳先: `ja-JP`
   - 表示名: `test`
4. 「開始」ボタンを押す
5. 初回は `chrome.permissions.request` が走り、tab capture 許可ダイアログが表示されるので許可
6. SW コンソールにセッション開始ログが出る
7. 再生中のタブに **Shadow DOM で挿入された翻訳オーバーレイ** が bottom に表示される (positionPreset 設定可)

### 7.2 マイク音声

1. マイクを有効にしたいタブ (or 任意のページ) を前面に
2. Popup の「ソース種別: マイク」で開始
3. Chrome の `getUserMedia` マイク許可ダイアログが出るので許可
4. Unlisted page (`monitor.html`) がタブで自動的に開き、オーバーレイがそこに表示される

### 7.3 セッション一覧 / 停止 / エクスポート

- 左サイドバーから拡張の「サイドパネル」を開く (Chrome 114+)
- 稼働中セッションが一覧表示される
- 各セッション右の「停止」ボタン、または「エクスポート (JSON)」ボタン
- エクスポート実行時は IndexedDB に保存された transcript / translation が JSON として DL される

## 8. よくあるハマり所 (Troubleshooting)

| 症状                                                            | 原因                                                     | 対応                                                                                                 |
| --------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| SW コンソールに `PERAPERA_RELAY_ACCESS_TOKEN is not configured` | wxt.config.ts に define が無い                           | 5.1 Option A を適用し、env set して再 build                                                          |
| Popup で「開始」後に `relay: 401 Unauthorized`                  | relay-api の `ACCESS_TOKENS` と不一致                    | 両側を同じ値に揃える (`dev-access-token` 既定)                                                       |
| WebSocket が即 1006 で切断される                                | `STREAM_TOKEN_SECRET` が 32 文字未満                     | 32+ chars に修正して relay 再起動                                                                    |
| `Failed to register service worker`                             | 既存 unpacked が衝突                                     | chrome://extensions で旧版を削除 → 再 load                                                           |
| 翻訳が出ず transcript だけ表示                                  | DeepL API Key が無効 or 無料枠超過                       | DeepL console でキー確認、DEEPL_BASE_URL が Free 用になっているか確認                                |
| `CORS: chrome-extension://<id> blocked`                         | `PERAPERA_RELAY_API_BASE_URL` が build 時 env と食い違い | build 時に export した origin と実 Relay URL を揃え再 build (`host_permissions` は env から自動導出) |
| tab capture で「このタブは対象外」                              | `activeTab` パーミッションの tab でない                  | 拡張アイコンをクリックしてから Popup で開始 (activeTab は user gesture で grant)                     |
| 翻訳が遅い / タイムアウト                                       | Provider 応答遅延                                        | `pino` SW コンソールで `STT-*` / `TRANSLATION-*` エラーコードを確認、degraded 遷移発生               |

## 9. 開発中の繰り返し workflow

```sh
# ターミナル 1: Relay API を watch モードで
set -a; source packages/relay-api/.env.local; set +a
pnpm --filter @perapera/relay-api dev

# ターミナル 2: 拡張を watch モードで
export PERAPERA_RELAY_API_BASE_URL=http://localhost:3001
export PERAPERA_RELAY_ACCESS_TOKEN=dev-access-token
pnpm --filter @perapera/extension dev

# 拡張を編集するたびに Chrome が自動リロード (WXT HMR)
# Relay API を編集するたびに tsx watch が再起動
```

品質ゲート (コミット前):

```sh
pnpm check  # fmt:check + lint + typecheck + test
```

## 10. 動作確認でやらないこと (scope 外)

以下は MVP ローカル環境では再現しないので動作確認から外す:

- **Chrome Web Store 公開**: Phase 7 IMPL-710 Step 2 で Developer Dashboard 登録後に実施
- **Cloud Run staging / production**: Phase 7 IMPL-700 Step 2 で GCP プロジェクト作成後に実施
- **k6 負荷試験**: ローカル設計の範囲外 (`just perf-ws` で手元実行は可能だが localhost 負荷で意味は薄い)
- **E2E (Playwright)**: CI で自動実行される前提 (`pnpm e2e` でローカル実行も可能だが unpacked build が先に必要)

## 11. 参考ドキュメント

- 設計書: `docs/in-progress/` 配下 (要件 / 基本設計 / 詳細設計 / API 仕様 / DB 設計 / UI/UX / テスト仕様 / インフラ / セキュリティ / 運用 / 実装タスク)
- インシデント対応 playbook: `docs/in-progress/10-operations-design/runbook.md`
- 脅威モデル × 実装 traceability: `docs/in-progress/09-security-design/threat-matrix-impl-mapping.md`
- プロジェクト規約: `CLAUDE.md` (ホットパス原則 / 命名 / テスト戦略 / Git Flow)
