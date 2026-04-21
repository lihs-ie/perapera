# perapera

音声ソースのリアルタイム文字起こし・翻訳結果を Chrome にオーバーレイ表示する Chrome 拡張機能。

- 拡張側（`packages/extension`）: WXT + TypeScript + React + Vitest + Playwright
- Relay API（`packages/relay-api`）: Node.js 24 LTS + Fastify + pino + Zod + neverthrow

詳細な要件・設計は `docs/in-progress/` を参照してください。開発規約は [`CLAUDE.md`](./CLAUDE.md) に集約されています。

## ローカル開発環境

### 前提

- Node.js 24.x LTS（`.nvmrc` に準拠、`nvm use` 推奨）
- pnpm 10.x（`corepack enable` で自動セットアップ）

### 初回セットアップ

```sh
corepack enable

# package.json の packageManager フィールドを corepack が自動で解決する
pnpm install
pnpm --filter @perapera/extension exec wxt prepare
```

### 主要コマンド

| 目的                  | コマンド             |
| --------------------- | -------------------- |
| 拡張の dev 起動       | `pnpm dev:extension` |
| Relay API の dev 起動 | `pnpm dev:relay`     |
| 両方同時起動          | `pnpm dev`           |
| 型検査                | `pnpm typecheck`     |
| Lint                  | `pnpm lint`          |
| Format check          | `pnpm fmt:check`     |
| 単体テスト            | `pnpm test`          |
| E2E (Playwright)      | `pnpm e2e`           |
| 品質ゲート一括        | `pnpm check`         |

`just` をインストールしていれば `just --list` でラベル付きタスクを一覧できます。

### ディレクトリ構成

```
packages/
├── extension/        # Chrome 拡張（WXT）
│   ├── src/          # オニオン: domain / application / infrastructure / presentation + entrypoints
│   ├── tests/        # Vitest 単体・結合
│   └── e2e/          # Playwright（unpacked extension 読込）
└── relay-api/        # Fastify バックエンド
    ├── src/          # オニオン + presentation/http, ws
    ├── tests/        # Vitest
    ├── perf/         # k6 シナリオ
    └── Dockerfile    # Cloud Run 用 multi-stage
```

## Git Flow

- `main` — 本番相当、タグ起点
- `develop` — 開発統合
- feature branch — `feat/*`, `fix/*`, `refactor/*`, `chore/*` 等を `develop` に PR

詳細は `~/.claude/rules/git-workflow.md` を参照。

## ライセンス

TBD
