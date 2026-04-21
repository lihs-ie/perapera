# GitHub Rulesets

`lihs-ie/perapera` に適用する GitHub Ruleset を JSON で版管理する。UI での手動設定に依存せず、再現・差分レビューを可能にする。

## 一覧

| ファイル               | 名前                         | 対象                           | 目的                                                                                                                 |
| ---------------------- | ---------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `protect-main.json`    | `Protect main`               | `refs/heads/main`              | 本番ブランチ保護。削除・force push 禁止、PR 必須、`All Green` status check 必須、linear history 強制                 |
| `protect-develop.json` | `Protect develop`            | `refs/heads/develop`           | 統合ブランチ保護。削除・force push 禁止、PR 必須、`All Green` status check 必須                                      |
| `branch-naming.json`   | `Conventional branch naming` | 全ブランチ (main/develop 除く) | `feat\|fix\|refactor\|chore\|docs\|test\|perf\|ci\|deps\|infra\|release\|hotfix/...` パターンのみ許可 **(※ 未適用)** |

> **注記**: `branch-naming.json` は現在 **未適用**。Public Personal Repo では API 経由での `branch_name_pattern` rule 追加が `422 Invalid rule 'branch_name_pattern'` で拒否されるため。
> 代替として以下で命名規約を強制している:
>
> - `.github/workflows/branch-name-check.yml` — push / PR 時に CI で validation
> - `.husky/pre-push` — ローカル push 前に reject
>
> Organization への移管や有料 plan への移行時に `gh api --method POST ... --input tools/rulesets/branch-naming.json` で本 JSON を適用し、workflow / hook 側は任意で残すか削除する。

## 適用

初回作成:

```sh
for name in protect-main protect-develop branch-naming; do
  gh api --method POST \
    -H "Accept: application/vnd.github+json" \
    repos/lihs-ie/perapera/rulesets \
    --input tools/rulesets/$name.json
done
```

更新 (既存 ruleset の `id` を指定して PUT):

```sh
rs_id=$(gh api repos/lihs-ie/perapera/rulesets --jq '.[] | select(.name=="Protect main") | .id')
gh api --method PUT \
  -H "Accept: application/vnd.github+json" \
  repos/lihs-ie/perapera/rulesets/$rs_id \
  --input tools/rulesets/protect-main.json
```

## 検証

```sh
gh api repos/lihs-ie/perapera/rulesets --jq '.[] | {id, name, enforcement, target}'
```

全 3 件が `enforcement: "active"` / `target: "branch"` で表示されれば OK。

## 削除（テスト用途）

```sh
rs_id=$(gh api repos/lihs-ie/perapera/rulesets --jq '.[] | select(.name=="<name>") | .id')
gh api --method DELETE repos/lihs-ie/perapera/rulesets/$rs_id
```

## 仕様の参照

- REST API: https://docs.github.com/en/rest/repos/rules
- Branch protection rules は ruleset で置換可能 (legacy 側は touch しない)
- `integration_id: 15368` は GitHub Actions の固定 App ID
- `actor_type: "RepositoryRole"` の `actor_id`: `1=read`, `2=triage`, `3=write`, `4=maintain`, `5=admin`
- `bypass_mode`: `always`（無条件 bypass）/ `pull_request`（PR 経由のみ bypass）

## 変更ポリシー

- このディレクトリの JSON を変更したら必ず PR を通し、merge 後に上記「更新」コマンドで GitHub 側に反映
- UI で手動変更した場合は、対応する JSON を即時更新して版管理と一致させる
