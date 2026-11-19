# 完了報告

- `NewsletterForm` を追加し、ホームに配置
- Enter でも登録できるよう、共通 `Button` の `type` の既定値を `"submit"` に変更（フォーム内のボタンが標準の HTML と同じ挙動になります）
- `NewsletterForm` のテストを追加（ボタンでの登録、Enter での登録、完了表示）
- 既存テストを含め `npm test` は全件通過。型チェックとビルドも通過。他の画面への影響はありません
