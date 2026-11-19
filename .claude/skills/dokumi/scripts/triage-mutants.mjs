#!/usr/bin/env node
// mutator の `--reporter agent` 出力を、dokumi の重大度（blocker / warning / note）に振り分ける。
// 線引きを毎回の判断に任せず固定するためのスクリプト。
//
// 使い方: node triage-mutants.mjs <agent.json> --base <mergeBase> [--root <dir>]
// 終了コード: 0 = blocker なし, 1 = blocker あり（スクリプトの失敗ではない）, 2 = 入力を読めなかった
//
// mutator は「変更した関数」単位でミュータントを選び、--include-test-changes を付けると
// 「変更したテストが実行する既存コード」も対象に入れる。どちらも今回書き換えていない行を含むので、
// --base を渡すと変更行と突き合わせて 3 つに分ける。
//   changedLine     ミュータントの位置が変更行に重なる        → 線引きどおり
//   changedFunction 変更した関数の中だが、変更していない行    → 1 段階下げる
//   unchangedCode   変更したテストが実行するだけの既存コード  → note
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const path = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const root = opt('--root', process.cwd());
const base = opt('--base', '');

let report;
try {
  report = JSON.parse(readFileSync(path, 'utf8'));
} catch (error) {
  console.log(JSON.stringify({ error: `mutator の出力を読めません: ${error.message}` }, null, 2));
  process.exit(2);
}

// ファイルごとの変更行。未追跡の新規ファイルは全行が変更行（null で表す）。
function changedLines() {
  if (!base) return null;
  const git = (...a) => {
    try {
      return execFileSync('git', a, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      return '';
    }
  };
  const map = new Map();
  let file = null;
  for (const row of git('diff', '--unified=0', '--no-color', '-M', base).split('\n')) {
    if (row.startsWith('+++ ')) {
      file = row === '+++ /dev/null' ? null : row.slice(6);
      if (file && !map.has(file)) map.set(file, []);
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))?/.exec(row);
    if (hunk && file) {
      const start = Number(hunk[1]);
      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
      // 削除だけの hunk（count 0）は、その位置の前後 1 行を変更行として扱う。
      map.get(file).push(count === 0 ? [start, start + 1] : [start, start + count - 1]);
    }
  }
  for (const untracked of git('ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean)) map.set(untracked, null);
  return map;
}
const changed = changedLines();
const overlaps = (file, from, to) => {
  const ranges = changed.get(file);
  if (ranges === undefined) return false;
  if (ranges === null) return true;
  return ranges.some(([a, b]) => from <= b && to >= a);
};
function locate(gap) {
  if (!changed) return 'unknown';
  const lines = gap.original.split('\n').length;
  if (overlaps(gap.file, gap.line, gap.line + lines - 1)) return 'changedLine';
  if (gap.scope && overlaps(gap.file, gap.scope.startLine, gap.scope.endLine)) return 'changedFunction';
  return 'unchangedCode';
}

const findings = [];
const oneLine = (text) => text.replace(/\s+/g, ' ').slice(0, 80);
const lower = { blocker: 'warning', warning: 'note', note: 'note' };

for (const warning of report.warnings ?? []) {
  const blocking = warning.kind === 'skippedTest' || warning.kind === 'uncollectedTest';
  findings.push({
    severity: blocking ? 'blocker' : 'note',
    kind: warning.kind,
    file: warning.file ?? null,
    line: warning.line ?? null,
    title: warning.message,
    fix:
      warning.kind === 'skippedTest'
        ? 'skip / todo を外して通す。外せないなら理由を報告する（テストを消さない）。'
        : warning.kind === 'uncollectedTest'
          ? 'テストランナーの include 設定を直し、このテストファイルが実行されるようにする。'
          : '子プロセス経由のテストはミュータントを観測できない。同じ振る舞いをプロセス内でテストする。',
  });
}

for (const gap of report.gaps ?? []) {
  if (gap.childProcess) continue;
  const where = locate(gap);
  let severity = 'warning';
  let reason = '未検出。1 回は修正を試み、残ったら PR 本文に載せる。';
  let pinned = false; // 位置によらず重大度を保つもの
  if (gap.critical) {
    severity = 'blocker';
    reason = '重要領域の未検出ミュータント。kill するか、人の承認つきで accept する。';
    pinned = true;
  } else if (gap.recheck) {
    severity = 'blocker';
    reason = '以前は検出できていたが、検出していたテストが消えた。テストを戻すか置き換える。';
    pinned = true;
  } else if (gap.gap === 'notReached') {
    severity = 'blocker';
    reason = '変更したコードをどのテストも実行していない。';
  }
  if (!pinned && where === 'changedFunction') {
    severity = lower[severity];
    reason = `変更した関数の中だが、今回書き換えていない行（1 段階下げた）。${gap.gap === 'notReached' ? 'どのテストも実行していない。' : '未検出。'}`;
  } else if (!pinned && where === 'unchangedCode') {
    severity = 'note';
    reason = '今回変更していない既存コード（変更したテストが実行するため対象に入った）。今回の変更の責任ではない。';
  }
  findings.push({
    severity,
    kind: gap.gap,
    where,
    key: gap.key,
    file: gap.file,
    line: gap.line,
    scope: gap.scope?.id ?? null,
    title: `${gap.gap}: ${oneLine(gap.original)} → ${oneLine(gap.replacement)}`,
    reason,
    fix: gap.fix,
    coveredBy: gap.coveredBy ?? [],
    simplify: gap.simplify ?? null,
  });
}

for (const finding of report.findings ?? []) {
  if (finding.kind === 'newTestNoKills')
    findings.push({
      severity: 'blocker',
      kind: finding.kind,
      test: finding.test,
      title: `新規テストが何も検出しない: ${finding.test}`,
      reason: 'このテストはコードを実行するだけで、振る舞いが壊れても落ちない。',
      fix: '呼び出し側から観測できる結果（戻り値、エラー、状態、外部への呼び出し）をアサートする。',
    });
  else if (finding.kind === 'detectionRegression')
    findings.push({
      severity: 'blocker',
      kind: finding.kind,
      key: finding.key ?? null,
      title: finding.message,
      reason: '変更していないコードの検出力が落ちた。テストを弱めていないか確認する。',
      fix: '弱めたアサーションや消したテストを戻す。',
    });
  else if (finding.kind === 'testNotMeasured')
    findings.push({ severity: 'note', kind: finding.kind, test: finding.test, title: finding.message });
}

// 根本原因ごとにまとめる材料。同じ関数の同じ種類の穴は、たいてい 1 つのテスト不足から来ている。
// レポートでは groups の 1 行を 1 件の指摘として書き、key は再確認（--only）用に添える。
const groups = [];
for (const f of findings.filter((x) => x.key)) {
  const id = `${f.severity}|${f.file}|${f.scope}|${f.kind}`;
  let group = groups.find((g) => g.id === id);
  if (!group) groups.push((group = { id, severity: f.severity, file: f.file, scope: f.scope, kind: f.kind, where: f.where, lines: [], keys: [] }));
  if (!group.lines.includes(f.line)) group.lines.push(f.line);
  group.keys.push(f.key);
}
for (const g of groups) delete g.id;

const byFile = {};
for (const f of findings.filter((x) => x.key)) {
  const row = (byFile[f.file] ??= { undetected: 0, changedLine: 0, changedFunction: 0, unchangedCode: 0, unknown: 0 });
  row.undetected++;
  row[f.where]++;
}

const count = (s) => findings.filter((f) => f.severity === s).length;
const order = { blocker: 0, warning: 1, note: 2 };
findings.sort((a, b) => order[a.severity] - order[b.severity]);
console.log(
  JSON.stringify(
    {
      scope: report.scope,
      // score と counts は mutator が対象にした全ミュータント（変更した関数 + 変更したテストが実行する既存コード）の値。
      // 「diff 内 N 件」と書くときは byFile の changedLine / changedFunction を使う。
      score: report.score ?? null,
      counts: report.counts ?? {},
      // CompileError は型検査を通らないミュータントで、実行されず、score の分母にも入らない。
      // 変更の中心が文字列リテラル型や型で縛られた値だと、そこは実測されていない。
      compileErrors: report.counts?.CompileError ?? 0,
      pending: report.counts?.Pending ?? 0,
      comparison: report.comparison ?? null,
      locationKnown: Boolean(changed),
      summary: { blocker: count('blocker'), warning: count('warning'), note: count('note') },
      byFile,
      groups,
      simplifyCandidates: findings.filter((f) => f.simplify).map((f) => ({ key: f.key, file: f.file, line: f.line, kind: f.simplify })),
      acceptance: report.acceptance ?? null,
      findings,
    },
    null,
    2,
  ),
);
process.exit(count('blocker') > 0 ? 1 : 0);
