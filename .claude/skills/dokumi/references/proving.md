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
npx vitest run --config .dokumi/review/vitest.config.ts 2>&1 | tee .dokumi/review/<名前>.log
```

プロジェクトの設定が関数形式だったり `vitest.config.*` が別にあるときは、それに合わせて読み込み元を変える。Jest なら `--rootDir . --testMatch '<rootDir>/.dokumi/review/*.test.*'`。

テストは、ユーザーに見える振る舞いで書く（「クリアを押しても送信されない」）。期待値は要件や変更前の挙動から決める。

## ベースと比べる

「今回の変更で壊れた」と言うには、ベースでは壊れていないことを示す必要がある。ベースの状態は worktree で用意する。

```sh
git worktree add --detach .dokumi/base <mergeBase>
ln -s "$PWD/node_modules" .dokumi/base/node_modules   # 依存が変わっていない場合。変わっていれば base 側で install する
```

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

作業ツリーで失敗し、ベースで通れば、今回の変更が原因だと示せる。両方で失敗するなら既存の問題（note）。

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
git worktree add --detach .dokumi/variant HEAD && (cd .dokumi/variant && git apply ../../.dokumi/working.patch)
# working.patch は `git diff <mergeBase> > .dokumi/working.patch`（未追跡ファイルは別途コピー）
```

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

別エージェントに依頼した後にも行う（相手が既存ファイルを変えていないかの確認）。

ビルドの成果物（`dist/` など）は、gitignore 済みなら残してよい。追跡対象に成果物が出るプロジェクトでは、ビルド後に元へ戻す。
