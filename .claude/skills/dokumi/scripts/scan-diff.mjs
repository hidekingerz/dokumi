#!/usr/bin/env node
// diff の追加行だけを対象に「完成したように見せる近道」を機械的に検出し、JSON で出力する。
// 既存コードの問題は拾わない（今回の変更が持ち込んだものだけを見る）。
// 使い方: node scan-diff.mjs [--base <ref>] [--root <dir>]
// 終了コード: 0 = blocker なし, 1 = blocker あり, 2 = 実行できなかった
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const root = opt('--root', process.cwd());
const git = (...a) =>
  execFileSync('git', a, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
const tryGit = (...a) => {
  try {
    return git(...a);
  } catch {
    return '';
  }
};

function resolveMergeBase() {
  const asked = opt('--base', '');
  const candidates = asked ? [asked] : ['origin/main', 'origin/master', 'origin/develop', 'main', 'master'];
  for (const ref of candidates) {
    const mergeBase = tryGit('merge-base', ref, 'HEAD').trim();
    if (mergeBase) return { ref, mergeBase };
  }
  return null;
}

const base = resolveMergeBase();
if (!base) {
  console.log(JSON.stringify({ error: 'ベースブランチを特定できません。--base <ref> を指定してください。' }, null, 2));
  process.exit(2);
}

const CODE = /\.(?:[cm]?[jt]sx?|vue|svelte|astro)$/;
const TEST = /(\.|\/)(test|spec)\.[cm]?[jt]sx?$|(^|\/)__tests__\/|(^|\/)e2e\//;
const IGNORED = /(^|\/)(node_modules|dist|build|coverage|\.next|\.nuxt|\.output|\.mutator|\.dokumi)\//;
// このスキル自身の検査スクリプトや lint 設定は、検出対象の文字列をパターンとして含むので除外する。
const SELF = /(^|\/)\.claude\/skills\/dokumi\//;

// where: 'code' = テスト以外のソース, 'test' = テスト, 'any' = 両方
const RULES = [
  { id: 'test-only', where: 'test', severity: 'blocker', re: /\b(?:describe|it|test|context)\.only\s*\(|\b(?:fdescribe|fit)\s*\(/,
    why: '.only が残ると他のテストが実行されなくなる。' },
  { id: 'test-skipped', where: 'test', severity: 'blocker', re: /\b(?:describe|it|test|context)\.(?:skip|todo|fixme)\s*\(|\b(?:xdescribe|xit|xtest)\s*\(/,
    why: '今回の変更で追加・編集された skip / todo は何も検証しない。外すか、外せない理由を報告する。' },
  { id: 'ts-suppress', where: 'any', severity: 'blocker', re: /@ts-(?:ignore|nocheck)\b/,
    why: '型エラーを直さずに黙らせている。原因の型を直す。' },
  { id: 'debugger', where: 'any', severity: 'blocker', re: /^\s*debugger\s*;?\s*$/,
    why: 'debugger 文が残っている。' },
  { id: 'ts-expect-error', where: 'code', severity: 'warning', re: /@ts-expect-error\b/,
    why: '型エラーの抑制。本当に必要か、理由が書かれているかを確認する。' },
  { id: 'any-type', where: 'code', severity: 'warning', re: /\bas\s+any\b|:\s*any\b(?!\w)|<any>|\bany\[\]|Array<any>|Record<string,\s*any>/,
    why: 'any で型検査を外している。unknown と絞り込み、または正しい型にする。' },
  { id: 'double-cast', where: 'code', severity: 'warning', re: /\bas\s+unknown\s+as\b/,
    why: '二段キャストで型検査を迂回している。' },
  { id: 'lint-suppress', where: 'any', severity: 'warning', re: /eslint-disable|biome-ignore|oxlint-disable|stylelint-disable|prettier-ignore/,
    why: 'lint を直さずに無効化している。' },
  { id: 'swallowed-error', where: 'code', severity: 'warning', re: /catch\s*(?:\([^)]*\))?\s*\{\s*\}|\.catch\(\s*(?:\(\s*\w*\s*\)|\w+)\s*=>\s*(?:\{\s*\}|null|undefined|void 0)\s*\)/,
    why: '例外を握りつぶしている。根本原因を隠していないか確認する。' },
  { id: 'stub', where: 'code', severity: 'warning', re: /not\s+(?:yet\s+)?implemented|未実装|仮実装|\bplaceholder\b(?!\s*[=:]|\w)|\bdummy\b|\bmock(?:ed)?\s+data\b/i,
    why: 'スタブや仮実装らしき記述。完了報告と食い違っていないか確認する。' },
  { id: 'console', where: 'code', severity: 'warning', re: /\bconsole\.(?:log|debug|trace|dir|table)\s*\(/,
    why: 'デバッグ出力が残っている。' },
  { id: 'loose-assertion', where: 'test', severity: 'note', re: /\.(?:toBeTruthy|toBeFalsy|toBeDefined)\s*\(\s*\)|expect\(\s*true\s*\)\.toBe\(\s*true\s*\)/,
    why: '緩いアサーション。段階 4（mutator）の結果と突き合わせる。' },
  { id: 'todo', where: 'any', severity: 'note', re: /\b(?:TODO|FIXME|HACK|XXX)\b/,
    why: '未完了の印。要件の取りこぼしでないか確認する。' },
  { id: 'timing-hack', where: 'any', severity: 'note', re: /\bwaitForTimeout\s*\(|setTimeout\s*\([^)]*,\s*0\s*\)/,
    why: '固定待ちやタイミング調整。不安定さの原因を隠していないか確認する。' },
];

const findings = [];
const add = (rule, severity, file, line, text, why) =>
  findings.push({ rule, severity, file, line, text: text.trim().slice(0, 200), why });

function scanLine(file, line, text) {
  if (!CODE.test(file)) return;
  const isTest = TEST.test(file);
  for (const rule of RULES) {
    if (rule.where === 'test' && !isTest) continue;
    if (rule.where === 'code' && isTest) continue;
    if (rule.re.test(text)) add(rule.id, rule.severity, file, line, text, rule.why);
  }
}

// 1. 追跡済みファイルの追加行（コミット済み + 作業ツリー）
const status = new Map();
for (const row of tryGit('diff', '--name-status', '-M', base.mergeBase).split('\n').filter(Boolean)) {
  const parts = row.split('\t');
  status.set(parts[parts.length - 1], parts[0][0]);
}
let file = null;
let lineNo = 0;
let removedTestCases = 0;
let addedTestCases = 0;
const TEST_CASE = /^\s*(?:it|test)(?:\.each\b[^(]*\([^)]*\))?\s*\(/;
for (const row of tryGit('diff', '--unified=0', '--no-color', '-M', base.mergeBase).split('\n')) {
  if (row.startsWith('+++ ')) {
    file = row === '+++ /dev/null' ? null : row.slice(6);
    continue;
  }
  if (row.startsWith('--- ')) continue;
  const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(row);
  if (hunk) {
    lineNo = Number(hunk[1]);
    continue;
  }
  if (row.startsWith('+')) {
    if (file && !IGNORED.test(file) && !SELF.test(file)) {
      scanLine(file, lineNo, row.slice(1));
      if (TEST.test(file) && TEST_CASE.test(row.slice(1))) addedTestCases++;
    }
    lineNo++;
  } else if (row.startsWith('-') && TEST_CASE.test(row.slice(1))) {
    removedTestCases++;
  }
}

// 2. 未追跡の新規ファイルは全行が追加行
const untracked = tryGit('ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean);
for (const path of untracked) {
  if (IGNORED.test(path) || SELF.test(path) || !CODE.test(path)) continue;
  status.set(path, 'A');
  readFileSync(join(root, path), 'utf8')
    .split('\n')
    .forEach((text, i) => {
      scanLine(path, i + 1, text);
      if (TEST.test(path) && TEST_CASE.test(text)) addedTestCases++;
    });
}

// 3. ファイル単位の検査
for (const [path, st] of status) {
  if (IGNORED.test(path)) continue;
  if (st === 'D' && TEST.test(path))
    add('test-file-deleted', 'warning', path, 0, 'テストファイルを削除', '削除したテストが守っていた振る舞いは、別のテストで守られているか。');
  if (st !== 'D' && /\.snap$|-snapshots\/|__snapshots__\/|__image_snapshots__\//.test(path))
    add('snapshot-changed', 'warning', path, 0, 'スナップショットを更新', '差分を読んで意図した変化だけか確認する。失敗を通すための一括更新でないこと。');
  if (
    st !== 'A' &&
    /(^|\/)(?:\.eslintrc[^/]*|eslint\.config\.[cm]?[jt]s|biome\.jsonc?|\.oxlintrc[^/]*|tsconfig[^/]*\.json|vitest\.config\.[cm]?[jt]s|jest\.config\.[cm]?[jt]s|playwright\.config\.[cm]?[jt]s|mutator\.config\.[^/]+|mutator\.accepted\.json)$|^\.github\/workflows\//.test(path)
  )
    add('guardrail-config-changed', 'warning', path, 0, '検査の設定ファイルを変更', 'lint・型・テスト・CI の基準を緩めて通していないか、差分を読んで確認する。');
}
if (removedTestCases > addedTestCases)
  add('test-cases-reduced', 'warning', '(tests)', 0, `テストケースの削除 ${removedTestCases} 件 > 追加 ${addedTestCases} 件`, 'テストが減っている。要件上不要になったのか、通すために消したのかを確認する。');

// 4. 依存の追加
const pkgFiles = [...status.keys()].filter((p) => /(^|\/)package\.json$/.test(p) && !IGNORED.test(p));
for (const path of pkgFiles) {
  if (!existsSync(join(root, path))) continue;
  let before = {};
  let after = {};
  try {
    after = JSON.parse(readFileSync(join(root, path), 'utf8'));
    const old = tryGit('show', `${base.mergeBase}:${path}`);
    if (old) before = JSON.parse(old);
  } catch {
    continue;
  }
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
    for (const name of Object.keys(after[field] ?? {})) {
      if (before[field]?.[name] === undefined && !Object.values(before).some((v) => v && typeof v === 'object' && name in v))
        add('dependency-added', field === 'dependencies' ? 'warning' : 'note', path, 0, `${field}: ${name}@${after[field][name]}`,
          '新しい依存。実在するか、保守されているか、既存の依存や標準 API で足りないか、バンドルへの影響を確認する。');
    }
  }
}

const order = { blocker: 0, warning: 1, note: 2 };
findings.sort((a, b) => order[a.severity] - order[b.severity] || a.file.localeCompare(b.file) || a.line - b.line);
const count = (s) => findings.filter((f) => f.severity === s).length;
console.log(
  JSON.stringify(
    { base, summary: { blocker: count('blocker'), warning: count('warning'), note: count('note') }, findings },
    null,
    2,
  ),
);
process.exit(count('blocker') > 0 ? 1 : 0);
