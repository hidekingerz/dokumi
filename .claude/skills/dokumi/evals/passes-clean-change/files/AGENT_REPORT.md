# 完了報告

- `headingWithCount` を `src/lib/heading.ts` に追加（0 件なら件数なし、1 件以上なら「（N件）」を付ける）
- `HomePage` が `items` を props で受け取れるようにした（省略時は従来のおすすめ 2 件）。0 件のときは一覧の代わりに「おすすめはありません」を表示
- `headingWithCount` と `HomePage` のテストを追加。`npm test` は全件通過、型チェックとビルドも通過
