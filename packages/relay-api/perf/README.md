# Relay API — Performance Tests (k6)

Go バイナリで動く [k6](https://k6.io/) を使った負荷試験シナリオを置く場所です。
`npm` / `pnpm` 管理外のため、以下のいずれかの方法で k6 CLI を導入してください。

## k6 の導入

- macOS: `brew install k6`
- Linux: [公式手順](https://grafana.com/docs/k6/latest/set-up/install-k6/) に従う
- `mise` 利用者: `mise use -g k6@latest`
- `nix` 利用者: `nix-shell -p k6`
- Docker: `docker run --rm -v $(pwd):/src -w /src grafana/k6 run scenarios/create-session.js`

## シナリオ一覧

| ファイル                      | 目的                                                                 |
| ----------------------------- | -------------------------------------------------------------------- |
| `scenarios/create-session.js` | `POST /sessions` の p95 500ms SLO（operations-design.md §2.2）を検証 |

今後追加予定: `ws-relay.js`（WebSocket ホットパス、`translation.final` p95 検証）

## 実行例

```sh
# Relay API を別プロセスで立ち上げておく
pnpm --filter @perapera/relay-api dev

# 別ターミナルから負荷試験
k6 run packages/relay-api/perf/scenarios/create-session.js

# 別 URL / 別トークンで動かす場合
RELAY_BASE_URL=https://stg-relay.example.com \
  ACCESS_TOKEN=<token> \
  k6 run packages/relay-api/perf/scenarios/create-session.js
```

`justfile` には `just perf-sessions` エイリアスを用意しています。
