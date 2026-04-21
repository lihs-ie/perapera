# perapera — 人間向けタスクランナー
# CI は pnpm script を直接叩くため、justfile への依存はしない（本ファイルは対話開発用）。

default:
    @just --list

# -- セットアップ --

install:
    pnpm install --frozen-lockfile

prepare:
    pnpm --filter @perapera/extension exec wxt prepare

# -- 開発 --

dev-extension:
    pnpm --filter @perapera/extension dev

dev-relay:
    pnpm --filter @perapera/relay-api dev

dev:
    pnpm dev

# -- ビルド --

build:
    pnpm -r --sequential build

build-extension:
    pnpm --filter @perapera/extension build

build-relay:
    pnpm --filter @perapera/relay-api build

zip-extension:
    pnpm --filter @perapera/extension zip

# -- 品質ゲート --

lint:
    pnpm lint

lint-fix:
    pnpm lint:fix

fmt:
    pnpm fmt

fmt-check:
    pnpm fmt:check

typecheck:
    pnpm typecheck

test:
    pnpm test

test-coverage:
    pnpm test:coverage

check:
    pnpm check

# -- E2E / Perf --

e2e-install:
    pnpm --filter @perapera/extension exec playwright install chromium

e2e:
    pnpm e2e

perf-sessions:
    k6 run packages/relay-api/perf/scenarios/create-session.js

# -- Docker（ローカル検証） --

docker-build-relay:
    docker build -f packages/relay-api/Dockerfile -t perapera-relay-api:local .

docker-run-relay:
    docker run --rm -p 3001:3001 --env-file .env.local perapera-relay-api:local

# -- クリーンアップ --

clean:
    pnpm clean
