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

| ファイル                      | 目的                                                                                                           |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `scenarios/create-session.js` | `POST /sessions` の p95 500ms SLO（operations-design.md §2.2）を検証                                           |
| `scenarios/ws-relay.js`       | `POST /sessions` → WebSocket `/relay` → `session.ready` 受信までの p95 レイテンシを同時 3 VU で検証 (IMPL-610) |

今後追加予定: `translation-hotpath.js`（`transcript.final` → `translation.final` p95 800ms の end-to-end 検証）

## 実行例

```sh
# Relay API を別プロセスで立ち上げておく (mock provider を選択)
STT_PROVIDER=mock TRANSLATION_PROVIDER=mock pnpm --filter @perapera/relay-api dev

# 別ターミナルから負荷試験 (個別)
k6 run packages/relay-api/perf/scenarios/create-session.js
k6 run packages/relay-api/perf/scenarios/ws-relay.js

# 別 URL / 別トークンで動かす場合
RELAY_BASE_URL=https://stg-relay.example.com \
  ACCESS_TOKEN=<token> \
  k6 run packages/relay-api/perf/scenarios/ws-relay.js

# WebSocket だけ別 URL にする (`BASE_URL` から http→ws 変換されるが上書き可能)
RELAY_BASE_URL=http://localhost:3001 \
  RELAY_WS_BASE_URL=ws://localhost:3001 \
  k6 run packages/relay-api/perf/scenarios/ws-relay.js
```

`justfile` には `just perf-sessions` / `just perf-ws` エイリアスを用意しています。

## CI 連携

現時点で GitHub Actions からの自動実行は未配線 (IMPL-610 の後続 PR で `.github/workflows/k6-smoke.yml` を追加予定)。手動検証と stg 環境に対する smoke に限定して運用する。
