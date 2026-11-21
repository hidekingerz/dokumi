# 段階 6：axe による自動のアクセシビリティ検査

名前のないダイアログ、コントラスト不足、読み上げ用の名前と見えている文字の食い違いは、画面を見ても操作しても気づきにくい。axe はこれを機械的に出す。axe が手元にないことを理由に飛ばすと、アクセシビリティが未検査のまま PASS になる。

## 1. axe を用意する

次の順で探し、最初に見つかったものを使う。

| 場所 | 使い方 |
|---|---|
| プロジェクトの依存（`axe-core` か `@axe-core/playwright`） | `node_modules/axe-core/axe.min.js` を `AXE_PATH` に渡す |
| 環境（`node -e "console.log(require.resolve('axe-core/axe.min.js'))"` が通る） | 出力されたパスを `AXE_PATH` に渡す |
| どちらにもない | プロジェクトの外（`.dokumi/tools/`）に取得する（下） |

```sh
mkdir -p .dokumi/tools && (cd .dokumi/tools && npm pack axe-core@4 --silent && tar -xzf axe-core-*.tgz)
# → .dokumi/tools/package/axe.min.js
```

`npm pack` は配布物を取ってくるだけで、`package.json` もロックファイルも `node_modules` も変えない。取得できないとき（ネットワークに出られない）だけ、「axe なしのため自動検査は未実施」と書く。

## 2. 実行する

`scripts/axe-scan.mjs` の `scan` を、`browser-check.mjs` から呼ぶ。

```js
// AXE_PATH=.dokumi/tools/package/axe.min.js node .dokumi/browser-check.mjs
import { scan } from '<このスキルのディレクトリ>/scripts/axe-scan.mjs';

const scans = [];
scans.push(await scan(page, '初期表示'));

await page.getByRole('button', { name: '削除' }).click();
await page.getByRole('dialog').waitFor();          // 状態ができたことを確かめてから検査する
scans.push(await scan(page, '削除の確認ダイアログ'));
```

- **axe が見るのは、呼んだ時点で表示されている DOM だけ。** 閉じたダイアログ、開いていないメニュー、出ていないエラー表示は検査されない。変更が触れた状態（ダイアログ、メニュー、エラー、空、選択中）を 1 つずつ作り、その都度 `scan` を呼ぶ。配色を切り替えられるなら、ライトとダークの両方で呼ぶ。
- **読み込みは `page.evaluate` で行う**（`scan` の中でそうしている）。`page.addScriptTag({ path })` は、CSP が `script-src 'self'` のページ（ブラウザ拡張機能など）では「インラインスクリプトの実行は CSP に反する」と拒否される。
- JSDOM や happy-dom の上で axe を回すテストがプロジェクトにあっても、この段階の代わりにはならない。レイアウトと色を計算しない環境では、コントラストの検査は実行されない。

## 3. 結果を読む

| `scan` の結果 | 意味 | 扱い |
|---|---|---|
| `violations` の `impact` が critical / serious | axe が違反と判定した | 変更した要素なら blocker。出力の `id` と `targets` を証拠に貼る |
| `violations` の `impact` が moderate / minor | 同上 | warning |
| `incomplete` | axe が判定を保留した。**違反なしではない** | 下のとおり、測れるものは測る。残りは件数を「未証明・未確認」に書く |

変更前からあった違反は、ベースでも同じ検査をして区別する（`references/browser-check.md` の 4）。

### 判定が保留されたコントラスト

`incomplete` の大半は `color-contrast` で、背景がグラデーション、文字が 1〜2 文字、要素が重なっている、といった理由で axe が比を決められなかったもの。数十要素になることがある。`scan` はこれを、計算済みの色から測り直して `measured` に入れる。

| `measured` の値 | 扱い |
|---|---|
| `ok: true` | 基準（通常の文字 4.5、大きい文字 3）を満たす。確認済み |
| `ok: false` | 基準未満。スクリーンショットで、文字が実際にその背景の上に載っていることを確かめてから指摘にする。グラデーションは、含まれる色のうち最も不利な色で計算しているため |
| `ratio: null` | 測れなかった（背景が画像、`rgb()` 以外の色表記）。未確認のまま残す |

レポートには、検査した状態の数、違反の件数、保留のうち測れた件数と測れなかった件数を書く。

### 網羅できないもの

- **ホバー中、フォーカス中の配色。** その状態になっている要素しか測れない。ホバーはマウスを置いた 1 要素だけ。代表を選んで測り、「ホバー時の配色は代表 N 要素のみ確認」と書く。
- **axe が検査しない項目。** キーボードで操作できるか、フォーカスの移動が妥当か、読み上げの内容が意味として正しいか。`references/browser-check.md` の 4 のキーボード操作は、axe を回しても省かない。
