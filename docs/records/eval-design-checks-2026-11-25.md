# 試験記録: 段階 7 に足した観点（ブラウザ対応・文字の拡大）

段階 7 に「ブラウザ対応」と「文字の拡大」を足したとき、その手順が実際に動くかを確かめた記録。2026-11-24〜25。

## 足した観点と、その出どころ

| 観点 | 内容 | 出どころ |
|---|---|---|
| ブラウザ対応 | 新しく使い始めた CSS や Web API の Baseline の状況を web-features で調べる。代替手段がなく、対応ブラウザのエンジンで要件の操作が壊れると再現できたときだけ blocker | modern-web-guidance プラグインの「Baseline Widely available でない機能には代替手段を付ける」という前提 |
| 文字の拡大 | ルートの文字サイズを 200% にして、変更した文字が大きくなるか、切れや重なりが出ないかを測る（WCAG 1.4.4） | modern-web-guidance の `respect-os-text-scale` |
| 似た要素の一貫性 | 足した要素のホバー・フォーカス・無効状態を、同じ役割の既存の要素と比べる | design プラグインの `/design-critique` の「Consistency」 |

`/design-critique` と modern-web-guidance そのものは dokumi に組み込まなかった。前者は第一印象や視覚的な階層のような、測れない判断が中心で、原則 1（証明できた指摘だけが止める）と原則 4（好みは対象外）に合わない。後者は実装の前に参照するためのもので、「古い書き方」は不具合ではない。どちらからも、測って証拠を付けられる観点だけを借りた。

最初の案では、文字の読みやすさを「本文 16px 以上、行間 1.5 倍」の目安で見ることにしていた。この数字に根拠がないので、200% に拡大して崩れないかを測る形に置き換えた。

## 手順を直接動かした結果

土台アプリ（`eval-fixtures/base-app`）に手順をそのまま当てた。Playwright 1.65.1、Chromium 159、WebKit 27.2、Firefox 159。

| 確かめたこと | 結果 |
|---|---|
| 200% で変更した見出しが大きくなるか | 32px → 64px。3 エンジンとも同じ |
| `px` 固定の検出（`h1` に 24px を差し込んだ） | 拡大後も 24px のままで、検出できた |
| 切れの検出（高さ固定と `overflow: hidden` を差し込んだ） | 検出できた |
| web-features を `compat_features` から引く | `anchor-name` は `false`、`:has()` は `"high"`、`popover`・`@starting-style`・View Transitions は `"low"` |

ここで手順の穴が 2 つ見つかり、`references/browser-check.md` を直した。

- 切れを縦方向（`scrollHeight`）でしか見ていなかった。横方向の切れ（「おすすめ（2」で切れる）を数えられないので、`scrollWidth` も見るようにした。
- Chromium では、拡大する前の 100% の時点で既に切れていた（WebKit では切れていなかった）。拡大の前後で測り、拡大して初めて出た切れだけを数えるようにした。

試験ケースを作るときに、WebKit が `Tab` でボタンに止まらないことも分かった（macOS の Safari の既定と同じ）。WebKit でキーボード操作を確かめると誤検出になるので、フォーカスの確認は `locator.focus()` で行うと書いた。

## 試験ケース

既存の 3 ケースには新しい CSS や Web API を使う変更がなく、ブラウザ対応の手順を通らない。そのため `flags-unsupported-feature-and-text-scale` を足した。

| 仕込んだ内容 | 期待 |
|---|---|
| 送料の説明を出すボタンを、`interestfor` 属性だけで作る（Chromium にしかない。web-features では Baseline 外）。対応ブラウザは土台側の `.browserslistrc` で Chrome・Safari・Firefox。「送料無料」バッジは `width: 64px` と `overflow: hidden`。完了報告は「対応ブラウザすべてで動作します」 | FIX。WebKit か Firefox で説明が出ないことを実行で示し、200% でバッジが切れることを測る |

題材は、候補の機能を 3 エンジンで実際に調べて選んだ。`anchor-name`、`field-sizing`、`if()` などは WebKit 27.2 で動いてしまい、壊れ方を再現できない。

## 結果

### `claude plugin eval` の隔離環境で流した 3 件（既存のケース）

| ケース | 結果 |
|---|---|
| flags-unmet-requirements-and-hollow-tests | 7/7 項目が合格 |
| proves-shared-component-breakage | 6/6 項目が合格 |
| passes-clean-change | 判定は正しく PASS。実ブラウザの証拠だけ不合格（5/6） |

不合格の原因は隔離環境の制約で、手順の変更ではない。記録によると、ポートを開けない（`listen EPERM 127.0.0.1:5173`）、Playwright がない、`git` と `npm` が動かない。そのため段階 6 は「未実施」と正しく報告され、mutator も手動の抜き取り検査に切り替わった。**この環境では段階 6 と、そこに依る段階 7 の手順は通らない。** この 3 件から言えるのは、段階 1〜5 と 8 が崩れていないことまで。

### このマシン上で別エージェントに流した 2 件

段階 6 を通すため、初版の試験と同じく、別エージェントにこのマシン上で直接 dokumi を実行させた。Playwright はプロジェクトの外に入れ、`NODE_PATH` で渡した。

| ケース | 判定 | 採点項目 |
|---|---|---|
| flags-unsupported-feature-and-text-scale | FIX（blocker 2、warning 4、note 1） | 7/7（私が採点） |
| passes-clean-change | PASS（warning 1、note 1） | 6/6（私が採点） |

新しいケースでは、次を示した。

- web-features で `interest-invokers` が Baseline 外であることを示し、`.browserslistrc` の 3 ブラウザと照らし合わせた。
- Chromium 159 / WebKit 27.2 / Firefox 159 を 2 つの幅で開き、説明が出るのは Chromium だけであることを確かめた。
- 200% で、拡大前は切れず、拡大後は表示幅 72px に対して中身が 97〜104px になることを測った。

仕込んでいない問題も 2 つ見つけた。100 円ちょうどの境界をテストしていないこと（ミュータントが検出されない）と、Chromium で説明が画面の左上に出てナビゲーションを覆うこと。

`passes-clean-change` では、200% の測定を 3 エンジンで行って新たな切れがないことを確かめ、ブラウザ対応は「新しい CSS / Web API なし」として対象外にした。新しい手順が、問題のない変更を誤って止めないことを確かめられた。

## 分かっていること・いないこと

- **新しい試験ケースは、`claude plugin eval` では段階 6 まで通らない。** 隔離環境でポートを開けないため。このマシン上で別エージェントに流す必要がある。
- 採点は、別エージェントの判定とレポートを私が採点基準に照らして行った。試験ツールの LLM による採点ではない。各ケース 1 回ずつで、ばらつきは見ていない。
- WebKit と Firefox は Playwright 同梱のエンジンで、製品版の Safari と Firefox ではない。
- 「似た要素の一貫性」は、どの試験ケースも通っていない。
- `passes-clean-change` のエージェントは、環境の制約で `report.md` と `report.json` をファイルに書けず、手順どおり全文を最終メッセージで返した。

## コミット

| コミット | 内容 |
|---|---|
| `9e3160e` | 段階 7 に、ブラウザ対応・文字の拡大・似た要素の一貫性を足す |
| `7e856ab` | 文字の拡大で、横の切れと拡大前からの切れを区別する |
| `28e3391` | ブラウザ対応と文字の拡大を確かめる試験ケースを足す |
