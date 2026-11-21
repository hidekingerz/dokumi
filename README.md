# dokumi
agent向け検証スキル群

## スキル

| スキル | 用途 |
|---|---|
| [`dokumi`](.claude/skills/dokumi/SKILL.md) | AI エージェントが生成したフロントエンドのコードを、PR を作る前に検証する。PASS / FIX / ESCALATE の判定と、人向け・エージェント向けのレポートを出す。 |

## ドキュメント

| 文書 | 内容 |
|---|---|
| [使い方](docs/usage.md) | 導入、呼び出し方、結果の見方、厳しさの切り替え |
| [判定基準](docs/criteria.md) | 何を調べ、何を PR の条件にしているか |
| [作業レポート](docs/work-report-2026-11-19.md) | 初版の作成と試験の記録 |
| [試用記録: coordination PR #69](docs/eval-coordination-pr69-2026-11-19.md) | 実プロジェクトの変更に当てた結果と、分かった課題 |
| [試用記録: chrome-bookmark-list（リポジトリ全体）](docs/eval-chrome-bookmark-list-2026-11-22.md) | リポジトリ全体に 5 回当てた結果のフィードバックと、手順に反映したこと |

## 使い方

`.claude/skills/dokumi/` を、対象リポジトリの `.claude/skills/`（または `~/.claude/skills/`）にコピーする（`evals/` は除く）。エージェントに「PR 前に dokumi で検証して」と頼むか、実装完了時に自動で呼ばれる。

厳しさは切り替えられる。プロジェクトにカバレッジのしきい値があればそれに従い、なければ `mode`（`standard` / `strict`）で決まる。warning を PR 前に人へ確認させたいときは `onWarning: ask`。指定は呼び出し時の指示か、プロジェクト直下の `dokumi.config.json`。

- 必須: Node.js 18 以上、git
- テストの質の実測（[mutator](https://github.com/mizchi/mutator) 0.4.0）: Node.js 24 以上と Vitest 5。満たさない場合は手動の抜き取り検査に切り替わる
- 実ブラウザ検証: Playwright。アクセシビリティの自動検査（axe-core）は、なければ `.dokumi/tools/` に取得して使う

スクリプトの試験は `bash eval-fixtures/script-tests.sh`。

## 出典

検証の原則は [pstack](https://github.com/cursor/plugins/tree/main/pstack)（MIT）を参考にした。
