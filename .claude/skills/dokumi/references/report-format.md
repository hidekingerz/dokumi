# 段階 8：レポートの形式

読み手が 2 種類いるので、ファイルを 2 つ書く。

| ファイル | 読み手 | 目的 |
|---|---|---|
| `.dokumi/report.md` | 人（レビュアー） | 何を信じてよく、どこを自分で見るべきかが 1 分で分かる |
| `.dokumi/report.json` | 生成エージェント | 指摘を 1 件ずつ機械的に処理して修正できる |

内容は同じものを指す。`report.md` の指摘の番号と `report.json` の `id` を揃える。

## 件数の数え方

冒頭の「blocker / warning / note」は指摘の件数。実施できなかった検査（lint が未設定、axe がない、など）は指摘ではないので数えず、「段階ごとの結果」の補足と「未証明・未確認」に書く。

同じ根本原因の指摘は 1 件にまとめる。mutator の未検出は `mutants-triage.json` の `groups` の 1 行を 1 件とする（9 個のミュータントが 1 つのテスト不足から来ているなら、指摘は 1 件）。

## 重大度

| 重大度 | 意味 | PR への影響 |
|---|---|---|
| `blocker` | 実行で証明された問題 | PR を作らない |
| `warning` | 証明はできていない懸念、または証明済みだが PR を止めるほどではないもの | PR 本文に載せて人に委ねる |
| `note` | 参考情報、変更前からあった問題 | PR 本文には載せない（`report.md` には残す） |

## report.md

下の構成を守る。該当なしの節は「なし」と書く（節ごと消すと、確認していないのか問題がなかったのか区別できない）。

```markdown
# dokumi レポート

**判定: FIX**（1 回目）　blocker 2 件 / warning 3 件 / note 1 件
ベース: `origin/main` (a1b2c3d) → 作業ツリー　変更 7 ファイル

## 要約
- 検索フォームの追加は要件 4 項目中 3 項目を満たす。空入力時にボタンが無効にならない（B1）。
- エラー時の分岐をどのテストも実行していない（B2）。
- 型・lint・既存テスト・ビルドは通過。実ブラウザで 375px と 1280px を確認済み。

## 段階ごとの結果
| 段階 | 結果 | 補足 |
|---|---|---|
| 1 機械ゲート | 通過 | typecheck / lint / test (42 件) / build |
| 2 ごまかし検出 | warning 1 | `any` 1 か所 |
| 3 要件適合 | blocker 1 | 独立レビューあり。捨てた指摘 1 件 |
| 4 テストの質 | blocker 1, warning 2 | mutator 0.4.0、変更行の未検出 5 件。全体の検出率 71%（24 件中 17 件、変更したテストが実行する既存コードを含む）。型エラーで未実測 0 |
| 5 影響範囲 | 証明済み（段階 4） | `SearchInput` は新規で、既存の呼び出し元なし |
| 6 実ブラウザ | blocker は B1 と同じ | `/search` をモバイル幅とデスクトップ幅で確認 |
| 7 フロントエンド観点 | warning 0 | 状態・a11y・レスポンシブを確認 |

## blocker
### B1. 空入力でも検索ボタンを押せる
- 場所: `src/features/search/SearchForm.tsx:31`
- 要件: 「検索欄が空なら検索ボタンを押せない」
- 証拠:
  ```
  $ node .dokumi/browser-check.mjs
  { "check": "空のとき検索ボタンが無効", "pass": false }
  ```
  スクリーンショット: `.dokumi/shots/search-mobile.png`
- 直し方: `disabled` の条件が `query === undefined` になっている。空文字と空白のみも無効にする。

### B2. エラー時の分岐をどのテストも実行していない
- 場所: `src/features/search/useSearch.ts:18-24`
- 証拠: mutator `notReached` 3 件（key: `1ufduz48mg4`, `137iu1zwifk`, `101x6pelqtr`）
- 直し方: 取得が失敗したときにエラーメッセージが表示されることを確かめるテストを足す。

## warning
### W1. `any` の追加
- 場所: `src/features/search/api.ts:12`
- 内容: API レスポンスを `any` で受けている。スキーマでパースすることを提案。

### W2. 未検出ミュータント 2 件（修正を 1 回試みる）
- `src/features/search/normalize.ts:8` `trim()` を削除しても落ちない（key: `k3kgc6il0y`）
- …

## 完了報告との食い違い
| 完了報告の主張 | 実際 | 根拠 |
|---|---|---|
| 「4 つの要件すべてにテストを追加、全件通過」 | エラー表示のテストは `test.skip`。`npm test` は 9 passed / 1 skipped | B2、`.dokumi/gate-test.log` |

## 受け入れ提案（人が決める）
等価と考えるミュータント。エージェントは `mutator accept` を実行していない。

| key | 場所 | 変更 | 等価と考える理由 |
|---|---|---|---|
| `s1nb18phao` | `src/features/search/SearchForm.tsx:44` | `items?.length` → `items.length` | `items` は直前の行で配列であることを確認済み |

承認する場合: `npx mutator accept s1nb18phao --reason "<理由>"`

## 未証明・未確認
- 影響範囲: なし
- 実ブラウザ: エラー表示は API をモックして確認。実 API では未確認。

## 確認済み（問題なしと判断したもの）
- `eslint-disable-next-line react-hooks/exhaustive-deps`（`useSearch.ts:9`）: 既存行の移動で、今回の追加ではない。

## 捨てた指摘
- 独立レビューの「デバウンスが効かない」: 再実行したところ 300ms で 1 回だけ呼ばれており、再現せず。

## 検証の副作用
- なし（作業ファイルは `.dokumi/` と `.mutator/` に置き、ローカルの除外設定に入れた。検証対象の差分は検証前と一致）。
- 作業ツリーに未追跡の `REQUIREMENTS.md` がある。PR に含めないよう注意。

## 人が見るべき箇所
1. `src/features/search/useSearch.ts` の競合対策（古い応答の破棄）。動作は確認したが、設計の是非は判断していない。
```

### 書き方

- **判定を最初に書く。** 読み手が最初に知りたいのは、PR にしてよいかどうか。
- **要約は 3 行程度。** 何が満たされ、何が満たされず、何を確かめたか。
- **証拠は実際の出力を貼る。** 「テストが失敗した」ではなく、コマンドと出力の該当行。長い出力は該当部分だけを貼り、全体はログファイルの場所を示す。
- **完了報告の主張は 1 つずつ裏を取る。** 食い違いは専用の節に並べる。生成エージェントの報告がどこまで信用できるかは、人がこの PR を読む深さを決める材料になる。
- **確かめていないことを確かめたように書かない。** 飛ばした段階、未実測のミュータント、到達できなかった画面は「未証明・未確認」に書く。
- **「人が見るべき箇所」は絞る。** 検証では判断できない設計や仕様の是非だけを挙げる。全ファイルを並べない。0 件なら「特になし」。

### PASS のとき：PR 本文に入れる節

`report.md` の末尾に、PR 本文にそのまま貼れる節を付ける。

```markdown
## 検証（dokumi）
- 判定: PASS（修正 1 回）
- 型 / lint / テスト 45 件 / ビルド: 通過
- ミューテーション検出率: 92%（diff 内 24 件中 22 件）。残り 2 件は下記
- 実ブラウザ: `/search` を 375px と 1280px で確認。コンソールエラーなし

### レビュアーに判断してほしいこと
- 未検出ミュータント 1 件: `normalize.ts:8` の `trim()`。テストを足すか、不要なら削除するか
- 等価ミュータントの受け入れ提案 1 件: `SearchForm.tsx:44`（理由と承認コマンドは上記）

### 未確認
- 実 API でのエラー表示（モックでのみ確認）
```

スクリーンショットは、PR に画像を添付できる手段があれば添付する。なければファイルの場所を書くだけにとどめ、`.dokumi/` をコミットしない。

### ESCALATE のとき

「人が見るべき箇所」の代わりに、決めてほしいことを 1 つずつ問いの形で書く。それぞれに、選択肢と、どちらを選ぶと何が変わるかを添える。

```markdown
## 決めてほしいこと
1. 「空なら押せない」は空白のみの入力を含むか。
   - 含む: `trim()` して判定する（現在の実装は含まない）。
   - 含まない: 現在の実装のままで B1 は解消済み。
```

## report.json

```json
{
  "verdict": "FIX",
  "round": 1,
  "base": { "ref": "origin/main", "mergeBase": "a1b2c3d" },
  "summary": { "blocker": 2, "warning": 3, "note": 1 },
  "stages": [
    { "id": 1, "name": "gate", "status": "pass", "detail": "typecheck, lint, test (42), build" },
    { "id": 4, "name": "test-quality", "status": "fail", "detail": "mutator 0.4.0, score 0.71, pending 0" },
    { "id": 6, "name": "browser", "status": "fail", "detail": "/search @ 375, 1280" }
  ],
  "findings": [
    {
      "id": "B1",
      "severity": "blocker",
      "stage": 3,
      "title": "空入力でも検索ボタンを押せる",
      "file": "src/features/search/SearchForm.tsx",
      "line": 31,
      "requirement": "検索欄が空なら検索ボタンを押せない",
      "evidence": {
        "command": "node .dokumi/browser-check.mjs",
        "output": "{ \"check\": \"空のとき検索ボタンが無効\", \"pass\": false }",
        "artifacts": [".dokumi/shots/search-mobile.png"]
      },
      "fix": "disabled の条件で空文字と空白のみも無効にする。",
      "recheck": "node .dokumi/browser-check.mjs"
    },
    {
      "id": "B2",
      "severity": "blocker",
      "stage": 4,
      "title": "エラー時の分岐をどのテストも実行していない",
      "file": "src/features/search/useSearch.ts",
      "line": 18,
      "evidence": { "command": "npx mutator --since a1b2c3d --reporter agent", "output": "notReached x3" },
      "mutantKeys": ["1ufduz48mg4", "137iu1zwifk", "101x6pelqtr"],
      "fix": "取得失敗時にエラーメッセージが表示されることを確かめるテストを足す。",
      "recheck": "npx mutator --only 1ufduz48mg4 --only 137iu1zwifk --only 101x6pelqtr --reporter agent"
    }
  ],
  "acceptProposals": [
    {
      "key": "s1nb18phao",
      "file": "src/features/search/SearchForm.tsx",
      "line": 44,
      "change": "items?.length -> items.length",
      "reason": "items は直前の行で配列であることを確認済み"
    }
  ],
  "unproven": ["実 API でのエラー表示（モックでのみ確認）"],
  "dropped": [{ "source": "independent-review", "title": "デバウンスが効かない", "why": "再実行で再現せず" }],
  "claimMismatches": [
    { "claim": "4 つの要件すべてにテストを追加、全件通過", "actual": "エラー表示のテストは test.skip（9 passed / 1 skipped）", "finding": "B2" }
  ],
  "sideEffects": [],
  "decisionsNeeded": []
}
```

### 項目

- `verdict`：`PASS` / `FIX` / `ESCALATE`。
- `round`：何回目の検証か（1 から）。3 回目は存在しない（2 回で直らなければ `ESCALATE`）。
- `stages[].status`：`pass` / `fail` / `skipped`。`skipped` には `detail` に理由を書く。
- `findings[]`：`blocker` を先に。すべての `blocker` に `evidence.command` と `evidence.output` が必要（なければ `warning` に下げる）。
- `findings[].fix`：何をどう直すかを具体的に。「テストを改善する」のような指示は不可。
- `findings[].recheck`：その指摘が直ったことを確かめるコマンド。再検証で使う。
- `claimMismatches[]`：完了報告の主張のうち、実際と食い違うもの。対応する指摘の `id` を `finding` に入れる。なければ空配列。
- `decisionsNeeded[]`：`ESCALATE` のとき、人に決めてほしいこと。`{ "question", "options": [{ "choice", "consequence" }] }`。

## 差し戻しを受けた側（生成エージェント）の進め方

1. `report.json` の `findings` を `blocker` から順に処理する。`warning` は 1 回だけ修正を試みる。
2. 各指摘を直したら、その `recheck` を実行して解消を確かめる。
3. 指摘が誤りだと考えるなら、直さずに、誤りだと示す実行結果を付けて返す（黙って無視しない）。
4. テストの削除、skip、検査設定の緩和、`mutator accept` の実行で blocker を消さない。
5. すべて処理したら dokumi を再実行する（`round` を 1 つ進める）。
