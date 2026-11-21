# 証明の定型

「実行で証明する」ための、段階をまたいで使う手順。段階 1、3、5、6 と、差し戻し前の修正案の確認で使う。

共通の前提：**作業ツリーの検証対象のファイルは書き換えない。** 壊して確かめたい、直して確かめたいときは、コピーの上で行う。作業ツリーを直接いじって戻す方法は、戻し忘れや、未コミットの変更の取り違えが起きる（`git stash` は未コミットの変更を退避するので特に危ない）。

## 再現テストを書いて実行する

再現用のテストは `.dokumi/review/` に置く。プロジェクトのテストランナーの `include` はたいてい `test/**` や `src/**` に限られていて、そのままでは拾われない。専用の設定を書いて指定する。

```ts
// .dokumi/review/vitest.config.ts
import { defineConfig } from 'vitest/config';
import base from '../../vite.config'; // プロジェクトの設定（プラグイン、環境、エイリアス）を引き継ぐ

// mergeConfig は使わない。配列を連結するので、プロジェクト本来の include も残って全テストが走る。
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    root: new URL('../..', import.meta.url).pathname,
    include: ['.dokumi/review/*.test.{ts,tsx}'], // 直下だけ。`**` にするとコピーしたツリーの中のテストまで拾う
  },
});
```

```sh
npx vitest run --config .dokumi/review/vitest.config.ts <ファイル名の一部> 2>&1 | tee .dokumi/review/<名前>.log
```

再現テストが増えると設定の `include` が全部拾うので、ファイル名で絞って実行する。値を見比べたいときは、`console.log` ではなくアサーションに入れるかファイルに書き出す（通過したテストの出力はログに出ないことがある）。

`defineConfig` の型によっては `base.test` が型エラーになる。そのときは `(base as { test?: object }).test` のように読む（テスト用の設定なので、型を緩めてよい）。

重いテスト（実データで全組み合わせを計算する、多数の条件を回す）は、既定の 5 秒で打ち切られる。そのテストだけ `it('...', () => { ... }, 120_000)` のように時間を延ばす。打ち切られても途中までの出力がファイルに残ることがあり、完了したように見えるので、ログの `Tests` の行で通過を確かめる。

プロジェクトの設定が関数形式だったり `vitest.config.*` が別にあるときは、それに合わせて読み込み元を変える。Jest なら `--rootDir . --testMatch '<rootDir>/.dokumi/review/*.test.*'`。

テストは、ユーザーに見える振る舞いで書く（「クリアを押しても送信されない」）。期待値は要件や変更前の挙動から決める。

## ベースと比べる

「今回の変更で壊れた」と言うには、ベースでは壊れていないことを示す必要がある。ベースの状態は worktree で用意する。

```sh
git worktree add --detach .dokumi/base <mergeBase>
ln -s "$PWD/node_modules" .dokumi/base/node_modules   # 依存が変わっていない場合。変わっていれば base 側で install する
```

`git worktree add` は、本体リポジトリの `.git/worktrees/` に管理情報を書く（対象のリポジトリ自体が worktree のときも、書き込み先は本体）。作業ツリーやコミットには影響しないが、片付けを忘れると残るので、最後に `git worktree list` で消えたことを確かめる。

同じテストを 2 つのツリーに当てるには、テスト対象の読み込み元を切り替えられるようにしておく。

```tsx
// .dokumi/review/contact-clear.test.tsx
const src = process.env.SRC ?? '../../src';
const { ContactPage } = await import(/* @vite-ignore */ `${src}/pages/ContactPage`);
```

```sh
npx vitest run --config .dokumi/review/vitest.config.ts                          > .dokumi/review/x.head.log 2>&1
SRC=../base/src npx vitest run --config .dokumi/review/vitest.config.ts          > .dokumi/review/x.base.log 2>&1
```

`SRC` はテストファイル（`.dokumi/review/`）からの相対パス。

**両方に同じ入力を渡す。** 入力データ（取り込んだ JSON、生成したフィクスチャ）をツリーごとに別々に読み込むと、読み込み処理が呼ぶたびに違う値を付ける場合（生成した id、タイムスタンプ、乱数）に、変更と無関係な不一致が全件に出る。入力は 1 回だけ作ってファイルに書き出し、両方の実行でそのファイルを読む。出力を比べる前に、ベース同士を 2 回実行して一致することを確かめておくと、比較方法の誤りを先に潰せる。

作業ツリーで失敗し、ベースで通れば、今回の変更が原因だと示せる。両方で失敗するなら既存の問題（note）。

この切り替えが使えるのは、ベースにも存在するモジュールを読むテストだけ。今回新しく追加されたファイルを import するテストは、ベースでは読み込みに失敗する。既存の画面への影響を比べるテストは、新規ファイルを読むテストと別のファイルに分ける。

画面で比べるときは、ベースの worktree でも開発サーバーを別のポートで起動し、同じ `browser-check.mjs` を両方に当てる（`references/browser-check.md`）。2 つ起動するとポートを取り合うので、ログから読んだポートがどちらのツリーのものか、変更したファイルを取得して確かめる（例：`curl -s <url>/src/components/Button.tsx | grep submit`）。

終わったら片付ける。

```sh
git worktree remove --force .dokumi/base
```

## 壊して確かめる・直して確かめる

テストが振る舞いの破壊に気づくか（段階 4 の代替手順）、考えた修正で本当に直るか（FIX を出す前）を確かめるときは、ソースのコピーの上で行う。

```sh
mkdir -p .dokumi/review/variant-a
cp -R src .dokumi/review/variant-a/src
# .dokumi/review/variant-a/src を編集する（壊す、または直す）
SRC=./variant-a/src npx vitest run --config .dokumi/review/vitest.config.ts
```

既存のテスト一式をコピーに当てたいときは、ツリーごと複製する。

```sh
git worktree add --detach .dokumi/variant <mergeBase>
git diff <mergeBase> -- . ':!.dokumi' | (cd .dokumi/variant && git apply)        # 追跡済みファイルの変更
git ls-files --others --exclude-standard | grep -v '^\.dokumi/' | while read -r f; do   # 未追跡の新規ファイル
  mkdir -p ".dokumi/variant/$(dirname "$f")" && cp "$f" ".dokumi/variant/$f"
done
ln -s "$PWD/node_modules" .dokumi/variant/node_modules
# .dokumi/variant の中を編集し、その中で npm test や npx mutator を実行する
```

変更の中心が未追跡の新規ファイルにあることは多い。パッチだけでは再現されないので、未追跡ファイルのコピーを忘れない。

`node_modules` をリンクで共有した複数のツリーで開発サーバーを同時に起動すると、依存の事前バンドルのキャッシュを取り合うことがある。挙動がおかしければ 1 つずつ起動する。

修正案を試すのは、「直し方が明確か」を判定するためと、`fix` に書く内容を確かなものにするため。確かめた修正を作業ツリーに適用するのは、判定を出した後の、生成エージェントの仕事。

## 証拠として残すもの

- 実行したコマンド（そのまま再実行できる形）
- 出力の該当部分（失敗したアサーション、エラーメッセージ、件数）。全体はログファイルに保存し、場所を書く
- 再現に使ったファイル（`.dokumi/review/` に置いたまま残す）

「確認した」ではなく「このコマンドがこの出力を出した」と書く。

## 検証対象を変えていないことの確認

検証の最初と最後に差分を取り、一致を確かめる。

```sh
git diff <mergeBase> -- . ':!.dokumi' > .dokumi/before.patch     # 最初
git diff <mergeBase> -- . ':!.dokumi' | diff - .dokumi/before.patch && echo unchanged   # 最後
git status --short                                               # 未追跡ファイルが増えていないか
```

`git diff` は未追跡ファイルの中身を見ない。未追跡の新規ファイルが変更に含まれるときは、そのハッシュも最初に取って最後に比べる。

```sh
git ls-files --others --exclude-standard | grep -v '^\.dokumi/' | xargs sha1sum > .dokumi/before.untracked   # 最初
git ls-files --others --exclude-standard | grep -v '^\.dokumi/' | xargs sha1sum | diff - .dokumi/before.untracked && echo unchanged   # 最後
```

別エージェントに依頼した後にも行う（相手が既存ファイルを変えていないかの確認）。

## 回をまたいで差分を取る

再検証では、前の回に検証した状態から何が変わったか（修正の差分）を独立レビューに渡す。修正がコミットされているとは限らないので、回の終わりに作業ツリーの状態を tree として記録しておく。

```sh
# 作業ツリーの今の状態（追跡済みの変更と未追跡の新規ファイル）を tree にして、その id を返す。
# 一時的なインデックスを使うので、作業ツリーも、本来のインデックスも、コミットも変わらない。
snap() { GIT_INDEX_FILE="$PWD/.dokumi/snapshot.index" git add -A . && GIT_INDEX_FILE="$PWD/.dokumi/snapshot.index" git write-tree; }

snap > .dokumi/round-1.tree                                    # 1 回目の最後（段階 8）
git diff "$(cat .dokumi/round-1.tree)" "$(snap)" > .dokumi/fix-1.patch   # 2 回目の最初: 1 回目からの修正の差分
```

`.dokumi/` はローカルの除外設定に入っているので、記録には入らない。記録した tree はどこからも参照されないが、git が掃除するのは既定で 2 週間より後なので、検証の間は残る。

差分が空なら、前の回から何も変わっていない。同じコードをもう一度検証することになるので、前の回と同じ確認を繰り返すのではなく、確認の範囲を広げる（`.dokumi/checks.md` で「未確認」だった要件、前の回に作らなかった状態）。

ビルドの成果物（`dist/` など）は、gitignore 済みなら残してよい。追跡対象に成果物が出るプロジェクトでは、ビルド後に元へ戻す。
