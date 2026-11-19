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

`project.json` の `commands.dev` をバックグラウンドで起動し、ログを `.dokumi/dev-server.log` に取る。実際に待ち受けたポートはログから読む（指定したポートが使用中だと、多くのサーバーは次の空きポートに移る）。

- 応答するまで待つ（`curl -sf <url>` が成功するまで、最大 60 秒程度）。
- 環境変数や外部 API が必要で起動できないときは、プロジェクトのモック手段（MSW、モックサーバー、`.env.example`）を探す。なければ、起動できなかった理由を記録して段階を終える。
- Storybook があり、変更がコンポーネント単体に閉じているなら、Storybook で確かめてもよい。その場合は「アプリ全体では未確認」と書く。
- 終わったら必ずサーバーを止める。

## 3. 操作して証拠を残す

Playwright のスクリプトを `.dokumi/browser-check.mjs` に書いて実行する。手作業の確認ではなくスクリプトにするのは、修正後に同じ確認を再実行できるようにするため。

```js
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
mkdirSync('.dokumi/shots', { recursive: true });
const browser = await chromium.launch();
const problems = [];
const results = [];

for (const viewport of [{ name: 'mobile', width: 375, height: 812 }, { name: 'desktop', width: 1280, height: 800 }]) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  page.on('console', (m) => m.type() === 'error' && problems.push({ viewport: viewport.name, kind: 'console', text: m.text() }));
  page.on('pageerror', (e) => problems.push({ viewport: viewport.name, kind: 'pageerror', text: String(e) }));
  page.on('requestfailed', (r) => problems.push({ viewport: viewport.name, kind: 'requestfailed', text: `${r.method()} ${r.url()}` }));
  page.on('response', (r) => r.status() >= 400 && problems.push({ viewport: viewport.name, kind: 'http', text: `${r.status()} ${r.url()}` }));

  await page.goto(`${BASE}/search`);
  // 要件ごとの操作と確認。期待と違えば results に失敗として記録する。
  const disabled = await page.getByRole('button', { name: '検索' }).isDisabled();
  results.push({ viewport: viewport.name, check: '空のとき検索ボタンが無効', pass: disabled });

  // 横方向のはみ出し
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  results.push({ viewport: viewport.name, check: '横スクロールが出ない', pass: !overflow });

  await page.screenshot({ path: `.dokumi/shots/search-${viewport.name}.png`, fullPage: true });
  await page.close();
}
await browser.close();
writeFileSync('.dokumi/browser-check.json', JSON.stringify({ results, problems }, null, 2));
console.log(JSON.stringify({ results, problems }, null, 2));
```

プロジェクトに Playwright がなければ、環境に入っているものを使う。どちらにもなければ、プロジェクトに依存を追加せず、段階を「Playwright なしのため未実施」として終える。

要素は、ユーザーが認識する手がかり（ロール、ラベル、表示テキスト）で指定する。クラス名や DOM の構造で指定すると、見つかっても「ユーザーに見えている」ことの確認にならない。

## 4. 確かめる項目

要件ごとの確認に加えて、変更した画面で次を見る。

| 項目 | 確かめ方 |
|---|---|
| コンソールエラー、未処理例外 | 上のスクリプトの `problems`。変更前から出ているものは、ベースで同じスクリプトを走らせて区別する |
| 失敗したリクエスト、4xx / 5xx | 同上 |
| 横方向のはみ出し | `scrollWidth > clientWidth` |
| キーボード操作 | `Tab` で変更した操作要素に到達でき、`Enter` / `Space` で動き、フォーカスが見える（フォーカス時のスクリーンショット） |
| 状態の表示 | ローディング、空、エラーを実際に出す。`page.route()` で応答を遅らせる、空配列を返す、500 を返す |
| アクセシビリティ違反 | `@axe-core/playwright` がプロジェクトにあれば実行。なければ axe-core を `page.addScriptTag` で読み込んで `axe.run()` |
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
| 変更前から存在した問題 | note（今回の変更の責任ではないが、気づいたので載せる） |

## 7. 完遂できなかったとき

認証が必要、外部 API に依存、データの準備ができない、などで画面に到達できないことがある。

- 到達できた範囲と、止まった場所、理由を書く。
- 要件のうち画面で確かめられなかった項目を列挙する。
- 確かめられなかった項目が要件の中心なら、判定は ESCALATE（人が手元で確かめる必要がある）。周辺なら、PASS でも「未確認」として PR 本文に載せる。
