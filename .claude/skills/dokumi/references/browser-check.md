# 段階 6：実ブラウザ検証

テストが通ることと、画面が動くことは別のこと。この段階では、変更した画面を実際に開いて操作し、要件どおりに動く証拠を残す。

## 1. 何を確かめるかを先に決める

`.dokumi/requirements.md` の各項目を、画面上の操作と期待結果に書き直す。

| 要件 | 操作 | 期待する結果 |
|---|---|---|
| 検索欄が空なら検索ボタンを押せない | `/search` を開く | ボタンが disabled |
| | 文字を入力する | ボタンが有効になる |

書き直せない要件（画面に現れないもの）は、この段階の対象外として他の段階に任せる。

変更したコンポーネントがどの画面で使われているかは、段階 5 の結果を使う。共有コンポーネントを変えたなら、使っている画面のうち代表的なものを 2〜3 か所確かめる。

## 2. サーバーを起動する

`project.json` の `commands.dev` を、自分のプロセスグループで起動する。こうしておくと、子や孫のプロセス（`npm` → `node` → `vite`）ごと確実に止められる。PID はグループの先頭になるシェル自身に書かせる（`$!` は `setsid` の PID で、グループの ID と一致しないことがある）。

```sh
setsid sh -c 'echo $$ > .dokumi/dev.pid; exec npm run dev' > .dokumi/dev-server.log 2>&1 &
```

複数のツリー（作業ツリー、ベース、修正案のコピー）を起動するときは、PID ファイルとログをツリーごとに分け、ポートも明示して分ける。

```sh
setsid sh -c 'echo $$ > .dokumi/dev-head.pid; exec npm run dev -- --port 5311 --strictPort' > .dokumi/dev-head.log 2>&1 &
(cd .dokumi/base && setsid sh -c 'echo $$ > ../dev-base.pid; exec npm run dev -- --port 5312 --strictPort' > ../dev-base.log 2>&1 &)
```

`--port` と `--strictPort` は Vite の引数。他のサーバーではそのツールの指定方法に合わせる。ポートを固定すると、どのツリーがどのポートかを取り違えない。

- **ポートとホストはログから読む。** 指定したポートが使用中だと、多くのサーバーは次の空きポートに移る。`localhost` と `127.0.0.1` のどちらで待ち受けているかもログに従う。
- 応答するまで待つ（`curl -sf <url>` が成功するまで、最大 60 秒程度）。
- 環境変数や外部 API が必要で起動できないときは、プロジェクトのモック手段（MSW、モックサーバー、`.env.example`）を探す。なければ、起動できなかった理由を記録して段階を終える。
- Storybook があり、変更がコンポーネント単体に閉じているなら、Storybook で確かめてもよい。その場合は「アプリ全体では未確認」と書く。

終わったら、起動したグループだけを止め、止まったことを確かめる。

```sh
kill -- -"$(cat .dokumi/dev.pid)" 2>/dev/null; sleep 1
curl -sf <url> >/dev/null && echo "まだ動いている" || echo stopped
```

`pkill -f vite` のように名前で止めない。同じマシンで動いている無関係のサーバーまで止めてしまう。

ベースと見比べるときは、ベースの worktree（`references/proving.md`）でも同じ方法で別のポートに起動する。

## 3. 操作して証拠を残す

Playwright のスクリプトを `.dokumi/browser-check.mjs` に書いて実行する。手作業の確認ではなくスクリプトにするのは、修正後やベースに対して同じ確認を再実行できるようにするため。

下は形を示す例。URL、ルーティングの方式（パスかハッシュか）、要素の名前はプロジェクトに合わせて書き換える。

```js
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
// require 経由で読む。プロジェクトに Playwright がなく、環境に入っているもの（NODE_PATH）を使う場合、
// ESM の import では見つからないため。
const { chromium } = createRequire(import.meta.url)('playwright');

const BASE = process.env.BASE_URL; // ログから読んだ URL を渡す
const TAG = process.env.TAG ?? 'head'; // ベースと比べるときは TAG=base
mkdirSync('.dokumi/shots', { recursive: true });
const browser = await chromium.launch();
const problems = [];
const results = [];

for (const viewport of [{ name: 'mobile', width: 375, height: 812 }, { name: 'desktop', width: 1280, height: 800 }]) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  // 意図して起こした失敗（エラー表示の確認など）は expected に入れて、問題として数えない。
  let expected = false;
  const note = (kind, text) => expected || problems.push({ viewport: viewport.name, kind, text });
  page.on('console', (m) => m.type() === 'error' && note('console', m.text()));
  page.on('pageerror', (e) => note('pageerror', String(e)));
  page.on('requestfailed', (r) => note('requestfailed', `${r.method()} ${r.url()}`));
  page.on('response', (r) => r.status() >= 400 && note('http', `${r.status()} ${r.url()}`));
  const check = (name, pass, detail) => results.push({ viewport: viewport.name, check: name, pass, detail });

  await page.goto(`${BASE}/#/search`);
  // 遷移や操作の後は、期待する要素が現れるのを待ってから値を読む。
  // 待たずに読むと、描画前の状態を読んで偽の不合格になる。
  const button = page.getByRole('button', { name: '検索' });
  await button.waitFor();
  check('空のとき検索ボタンが無効', await button.isDisabled());

  await page.getByLabel('キーワード').fill('りんご');
  await button.click();
  await page.getByRole('listitem').first().waitFor();
  check('検索結果が表示される', (await page.getByRole('listitem').allTextContents()).join(' | ').includes('りんご'),
    await page.getByRole('listitem').allTextContents());

  // エラー表示の確認: 失敗を意図して起こす
  expected = true;
  await page.route('**/api/items*', (route) => route.fulfill({ status: 500, body: '{}' }));
  await button.click();
  const shown = await page.getByText('検索に失敗しました').waitFor({ timeout: 3000 }).then(() => true, () => false);
  check('取得失敗時にエラーを表示する', shown);
  await page.unroute('**/api/items*');
  expected = false;

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  check('横スクロールが出ない', !overflow);

  await page.screenshot({ path: `.dokumi/shots/search-${TAG}-${viewport.name}.png`, fullPage: true });
  await page.close();
}
await browser.close();
writeFileSync(`.dokumi/browser-check.${TAG}.json`, JSON.stringify({ results, problems }, null, 2));
console.log(JSON.stringify({ results, problems }, null, 2));
process.exit(results.every((r) => r.pass) && problems.length === 0 ? 0 : 1);
```

### 読み方と待ち方

確認側の誤りで偽の不合格が出やすいのは、次の 2 つ。

- **内容が差し替わる画面は、要素ではなく内容を待つ。** 条件を変えると同じ場所の要素が再計算で入れ替わる画面（一覧、提案、検索結果）では、「要素が現れるまで待つ」はすぐ通ってしまい、古い内容を読む。操作の前に内容を控え、変わるまで待つ。

  ```js
  const before = await page.locator('article').first().textContent();
  await page.getByRole('button', { name: 'イタリア流' }).click();
  await page.waitForFunction((b) => document.querySelector('article')?.textContent !== b, before, { timeout: 5000 })
    .catch(() => {}); // 変わらないのが正しい場合もあるので、ここでは落とさず、後のアサーションで判定する
  ```

  再計算に遅延（デバウンス、`setTimeout`）がある画面では、その間に要素が一時的に消えることもある。位置や文字を読む直前に、要素があることをもう一度待つ。
- **閉じた `<details>` や非表示の要素の文字は `innerText` に出ない。** `innerText` は表示されている文字だけを返す。折りたたまれた中身を読むなら `textContent` を使うか、開いてから読む。ユーザーに見えていることを確かめたいときは `innerText`、内容が正しいことを確かめたいときは `textContent`、と使い分ける。

### 配置を測るとき

位置、高さ、折り返し、はみ出しは、表示される中身で結果が変わる。1 つの条件で「収まる」と確かめても、文字が数文字長い別の条件では収まらないことがある（実例：状態行に足したリンクが、隣のラベルが「厚手でよさそう」なら同じ行に収まり、「ふつうの厚さでよさそう」なら次の行に折り返して、下の内容を 24px 押し下げた。同じ変更を別々に検証して、結論が分かれた）。

- その領域に出る文字列や要素のうち、長さや数が変わるものを挙げる（状態で変わるラベル、API から来る値、選択肢の名前、件数）。
- **短い場合と長い場合の両方**で測る。日付、入力、設定、`page.route()` の応答を変えて作る。追加した要素自身の表示が変わる場合（選択後にラベルが長くなる、など）も含める。
- **API をモックするときは、モックが選んだ値が結果を決めていないか疑う。** 少なくとも 1 回は、モックなしの実際の応答でも測る（外に出られる環境なら）。
- ベースと比べる要件（「今より下がらない」）は、同じ条件でベースも測り、条件ごとに並べる。
- **比べるのは、head とベースで同じ内容が表示された組だけ。** 実際の API は、回数制限や一時的な失敗で、2 回の呼び出しに別の応答を返すことがある（片方は予報、片方はエラー表示）。測った値と一緒に、その領域に表示された文字列を記録し、一致した組だけを比較に使う。一致しなかった組は「比較できず」として残し、不合格にも合格にも数えない。実際の応答が安定しないときは、モックした条件を主にして、実際の応答は取れた分だけ添える。
- 「今日」で変わる表示（季節、曜日）は、`page.clock.setFixedTime()` で日付を固定して作る。折り返しはフォントでも変わるので、測った環境のフォントをレポートに書く。
- レポートには、測った条件と値をすべて書く。「375px で確認」だけでは、どの内容で測ったのかが分からない。

1 つでも要件に反する条件があれば、その条件を添えて指摘にする。全条件で反するなら実害は「確認済み」、一部だけならどの条件で起きるかを書く。

プロジェクトに Playwright がなければ、環境に入っているものを使う（`node -e "require('playwright')"` が通るかで確かめる）。どちらにもなければ、プロジェクトに依存を追加せず、段階を「Playwright なしのため未実施」として終える。

要素は、ユーザーが認識する手がかり（ロール、ラベル、表示テキスト）で指定する。クラス名や DOM の構造で指定すると、見つかっても「ユーザーに見えている」ことの確認にならない。

不合格が出たら、まず確認側を疑う（待機の不足、URL やセレクタの誤り）。確認方法が正しいと確かめてから、アプリの問題として記録する。

### アプリの操作では出せない状態を確かめる

props やデータ次第の状態（0 件、大量、長い文字列）が、アプリの画面からは作れないことがある。次の順で試す。

1. **API の応答を差し替える。** `page.route()` で空配列、大量のデータ、エラー、遅延を返す。データが API から来るなら、これが実際の経路に最も近い。
2. **検証用のページでコンポーネントを描画する。** 開発サーバーはプロジェクト直下のファイルを配信するので、`.dokumi/review/` に HTML と小さなエントリを置けば、アプリのビルド設定のままコンポーネントを任意の props で描画できる。

   ```html
   <!-- .dokumi/review/empty.html → <url>/.dokumi/review/empty.html で開く -->
   <div id="root"></div>
   <script type="module">
     import { createElement } from 'react';
     import { createRoot } from 'react-dom/client';
     import '/src/styles.css';
     import { HomePage } from '/src/pages/HomePage';
     createRoot(document.getElementById('root')).render(createElement(HomePage, { items: [] }));
   </script>
   ```

   この方法で確かめたものは「コンポーネント単体で確認。アプリの経路では到達しない」と書く。
3. ソースを一時的に書き換えて状態を作ることはしない（検証対象を変えてしまう）。

## 4. 確かめる項目

要件ごとの確認に加えて、変更した画面で次を見る。

| 項目 | 確かめ方 |
|---|---|
| コンソールエラー、未処理例外 | 上のスクリプトの `problems`。変更前から出ているものは、ベースの worktree で同じスクリプトを `TAG=base` で走らせて区別する |
| 失敗したリクエスト、4xx / 5xx | 同上 |
| 横方向のはみ出し | `scrollWidth > clientWidth` |
| キーボード操作 | `Tab` で変更した操作要素に到達でき、`Enter` / `Space` で動き、フォーカスが見える（フォーカス時のスクリーンショット） |
| 状態の表示 | ローディング、空、エラーを実際に出す。`page.route()` で応答を遅らせる、空配列を返す、500 を返す |
| アクセシビリティ違反 | `@axe-core/playwright` か `axe-core` がプロジェクトか環境にあれば実行（`page.addScriptTag({ path })` で読み込んで `axe.run()`）。どちらもなければ依存を足さず、「axe なしのため自動検査は未実施」と書き、キーボード操作と名前の確認を手で行う |
| 長い文字列、大量データ | 入力や `page.route()` の応答で与え、崩れないかをスクリーンショットで確認 |

全項目を毎回やる必要はない。変更が触れた範囲に関係するものを選び、選ばなかった項目は「対象外」と書く。

## 5. スクリーンショットを自分で見る

撮っただけで終わらせない。画像を開いて読み、次を確かめる。

- 要件の画面が実際に表示されているか（エラー画面、空白、ログイン画面でないか）
- レイアウトの崩れ、重なり、切れた文字がないか
- モバイル幅で操作要素が押せる大きさか

「スクリーンショットを撮った」は証拠ではなく、「スクリーンショットに○○が表示されている」が証拠。

## 6. 重大度

| 結果 | 重大度 |
|---|---|
| 要件の操作が期待どおりに動かない | blocker |
| 変更によって新たに出たコンソールエラー、未処理例外、失敗リクエスト | blocker |
| 変更した画面のはみ出し、操作不能 | blocker |
| キーボードで操作できない、axe の critical / serious 違反（変更した要素） | blocker |
| axe の moderate / minor 違反、見た目の軽微な崩れ | warning |
| 現実には起きにくい極端な入力（数百文字の切れ目のない文字列など）でだけ起きる崩れ | warning |
| 変更前から存在した問題 | note（今回の変更の責任ではないが、気づいたので載せる） |

## 7. 完遂できなかったとき

認証が必要、外部 API に依存、データの準備ができない、などで画面に到達できないことがある。

- 到達できた範囲と、止まった場所、理由を書く。
- 要件のうち画面で確かめられなかった項目を列挙する。
- 確かめられなかった項目が要件の中心なら、判定は ESCALATE（人が手元で確かめる必要がある）。周辺なら、PASS でも「未確認」として PR 本文に載せる。
