#!/usr/bin/env node
// mutator の `--reporter agent` 出力を、dokumi の重大度（blocker / warning / note）に振り分ける。
// 線引きを毎回の判断に任せず固定するためのスクリプト。
// 使い方: node triage-mutants.mjs <agent.json> [--round <n>]
// 終了コード: 0 = blocker なし, 1 = blocker あり, 2 = 入力を読めなかった
import { readFileSync } from 'node:fs';

const [path, ...rest] = process.argv.slice(2);
const roundAt = rest.indexOf('--round');
const round = roundAt >= 0 ? Number(rest[roundAt + 1]) : 1;

let report;
try {
  report = JSON.parse(readFileSync(path, 'utf8'));
} catch (error) {
  console.log(JSON.stringify({ error: `mutator の出力を読めません: ${error.message}` }, null, 2));
  process.exit(2);
}

const findings = [];
const gaps = report.gaps ?? [];
const oneLine = (text) => text.replace(/\s+/g, ' ').slice(0, 80);
const describe = (gap) => `${oneLine(gap.original)} → ${oneLine(gap.replacement)}`;

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

for (const gap of gaps) {
  if (gap.childProcess) continue;
  let severity = 'warning';
  let reason = '未検出。1 回は修正を試み、残ったら PR 本文に載せる。';
  if (gap.critical) {
    severity = 'blocker';
    reason = '重要領域の未検出ミュータント。kill するか、人の承認つきで accept する。';
  } else if (gap.recheck) {
    severity = 'blocker';
    reason = '以前は検出できていたが、検出していたテストが消えた。テストを戻すか置き換える。';
  } else if (gap.gap === 'notReached') {
    severity = 'blocker';
    reason = '変更したコードをどのテストも実行していない。';
  }
  findings.push({
    severity,
    kind: gap.gap,
    key: gap.key,
    file: gap.file,
    line: gap.line,
    scope: gap.scope?.id ?? null,
    title: `${gap.gap}: ${describe(gap)}`,
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

// 関数ごとにまとめておく（修正は関数単位で進め、再確認は --only <key> で行う）。
const byFunction = {};
for (const f of findings.filter((x) => x.key)) (byFunction[`${f.file}#${f.scope}`] ??= []).push(f.key);

const count = (s) => findings.filter((f) => f.severity === s).length;
console.log(
  JSON.stringify(
    {
      round,
      scope: report.scope,
      score: report.score ?? null,
      counts: report.counts ?? {},
      pending: report.counts?.Pending ?? 0,
      comparison: report.comparison ?? null,
      summary: { blocker: count('blocker'), warning: count('warning'), note: count('note') },
      simplifyCandidates: findings.filter((f) => f.simplify).map((f) => ({ key: f.key, file: f.file, line: f.line, kind: f.simplify })),
      acceptance: report.acceptance ?? null,
      byFunction,
      findings,
    },
    null,
    2,
  ),
);
process.exit(count('blocker') > 0 ? 1 : 0);
