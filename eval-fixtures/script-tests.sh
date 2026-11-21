#!/usr/bin/env bash
# dokumi のスクリプト（detect-project.mjs、scan-diff.mjs）の試験。一時ディレクトリに小さなリポジトリを作って実行する。
# 使い方: bash eval-fixtures/script-tests.sh [scripts ディレクトリ]（省略時はこのリポジトリのスキル）
set -u
SK=$(cd "${1:-$(dirname "$0")/../.claude/skills/dokumi/scripts}" && pwd) || exit 2
W=$(mktemp -d); cd "$W"; fail=0
ok() { if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1: got [$2] want [$3]"; fail=1; fi; }
git init -q -b main . && git config user.email t@example.com && git config user.name t
mkdir -p src test
echo '{"name":"x","scripts":{"test":"vitest run"},"devDependencies":{"vitest":"^5.0.0"}}' > package.json
printf 'import { it } from "vitest";\nit.only("old", () => {});\n' > test/old.test.ts   # 最初のコミットから変わらないファイル
echo '<div class="app"></div>' > src/index.html
echo 'export const a = 1;' > src/a.ts
git add -A && git commit -qm root
ROOT=$(git rev-parse HEAD)
echo 'export const b = 2;' > src/b.ts && git add -A && git commit -qm second
cat > src/ui.ts <<'TS'
export const html = `<span class="bookmark-drag-preview-icon-placeholder">x</span>`;
export const C = { FAVICON_PLACEHOLDER: '.favicon-placeholder' };
const placeholder = document.querySelector<HTMLElement>('.favicon-placeholder');
if (!placeholder) throw new Error('none');
placeholder.textContent = 'x';
// img 一覧と placeholder 一覧を index で突き合わせる
input.placeholder = '検索';
TS
cat > src/stub.ts <<'TS'
// placeholder implementation until the API is ready
export const load = () => ({}); // just a placeholder
export const save = () => { throw new Error('not implemented'); };
export const items = []; // 仮実装
TS
mkdir -p .claude/skills/dokumi/evals/c/files/overlay/test .claude/skills/dokumi/scripts .dokumi/review
echo 'it("x", () => {});' > .claude/skills/dokumi/evals/c/files/overlay/test/Page.test.tsx
echo '// x' > .claude/skills/dokumi/scripts/scan-diff.mjs
echo 'it("r", () => {});' > .dokumi/review/repro.test.ts
echo .dokumi/ >> .git/info/exclude

scan=$(node "$SK/scan-diff.mjs" --base main)
ok "stub: クラス名や変数名の placeholder を拾わない" "$(echo "$scan" | node -e 'const s=JSON.parse(require("fs").readFileSync(0));console.log(s.findings.filter(f=>f.rule==="stub"&&f.file==="src/ui.ts").length)')" 0
ok "stub: 仮実装の記述は拾う" "$(echo "$scan" | node -e 'const s=JSON.parse(require("fs").readFileSync(0));console.log(s.findings.filter(f=>f.rule==="stub"&&f.file==="src/stub.ts").map(f=>f.line).join(","))')" "1,2,3,4"

ok "accept: 受け入れの記録がなければ何も出ない" "$(echo "$scan" | node -e 'const s=JSON.parse(require("fs").readFileSync(0));console.log(s.findings.filter(f=>f.rule==="mutants-accepted").length)')" 0
echo '{"k1":{"reason":"x"}}' > mutator.accepted.json
ok "accept: 未追跡の mutator.accepted.json を検出する" "$(node "$SK/scan-diff.mjs" --base main | node -e 'const s=JSON.parse(require("fs").readFileSync(0));console.log(s.findings.filter(f=>f.rule==="mutants-accepted").map(f=>f.severity+":"+f.file).join(","))')" "warning:mutator.accepted.json"
git add mutator.accepted.json && git commit -qm accept
ok "accept: コミット済みの新規追加も検出する" "$(node "$SK/scan-diff.mjs" --base "$ROOT" | node -e 'const s=JSON.parse(require("fs").readFileSync(0));console.log(s.findings.filter(f=>/accepted/.test(f.file)).map(f=>f.rule).join(","))')" "mutants-accepted"
echo '{"k1":{"reason":"x"},"k2":{"reason":"y"}}' > mutator.accepted.json
ok "accept: 既存の記録への追記は 1 件として検出する" "$(node "$SK/scan-diff.mjs" --base main | node -e 'const s=JSON.parse(require("fs").readFileSync(0));console.log(s.findings.filter(f=>/accepted/.test(f.file)).map(f=>f.rule).join(","))')" "mutants-accepted"
git checkout -q mutator.accepted.json

all=$(node "$SK/scan-diff.mjs" --all)
ok "scan --all: 最初のコミットから変わらないファイルも見る" "$(echo "$all" | node -e 'const s=JSON.parse(require("fs").readFileSync(0));console.log((s.findings??[]).filter(f=>f.rule==="test-only").map(f=>f.file).join(","))')" "test/old.test.ts"
ok "scan --all: スキル自身と作業ファイルは見ない" "$(echo "$all" | node -e 'const s=JSON.parse(require("fs").readFileSync(0));console.log((s.findings??[]).filter(f=>/^\.(claude|dokumi)\//.test(f.file)).length)')" 0
rootscan=$(node "$SK/scan-diff.mjs" --base "$ROOT")
ok "（参考）最初のコミットをベースにすると old.test.ts を見落とす" "$(echo "$rootscan" | node -e 'const s=JSON.parse(require("fs").readFileSync(0));console.log(s.findings.filter(f=>f.rule==="test-only").length)')" 0

det=$(node "$SK/detect-project.mjs" --base main)
q() { echo "$det" | node -e "const p=JSON.parse(require('fs').readFileSync(0));console.log($1)"; }
ok "detect: スキル自身のファイルを変更に数えない" "$(q 'p.diff.all.filter(f=>f.includes(".claude/skills/dokumi/")).length')" 0
ok "detect: スキルの試験用ファイルで touchesUi にならない" "$(q 'p.diff.touchesUi')" false
ok "detect: テストランナーが拾い得るスキル内のテストを報告する" "$(q 'p.interference?.testFilesUnderSkills?.join(",")')" ".claude/skills/dokumi/evals/c/files/overlay/test/Page.test.tsx"
ok "detect: .dokumi の中のテストも報告する" "$(q 'p.interference?.testFilesUnderWork?.join(",")')" ".dokumi/review/repro.test.ts"
git add src && git commit -qm third
det=$(node "$SK/detect-project.mjs" --all)
ok "detect --all: 差分がなくても全ファイルを対象にする" "$(q 'p.diff.touchesUi+" "+p.diff.all.includes("src/index.html")+" "+p.diff.whole')" "true true true"
det=$(node "$SK/detect-project.mjs" --base main)
ok "detect: --all なしでは従来どおり差分だけ" "$(q 'p.diff.files+" "+p.diff.whole')" "0 false"
rm -rf "$W"; exit $fail
