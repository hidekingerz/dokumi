#!/usr/bin/env node
// 検証対象プロジェクトの構成を調べ、dokumi の各段階で使うコマンドと適用可否を JSON で出力する。
// 使い方: node detect-project.mjs [--base <ref>] [--root <dir>]
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const root = opt('--root', process.cwd());
const git = (...a) => {
  try {
    return execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
};

function resolveBase() {
  const asked = opt('--base', '');
  const candidates = asked ? [asked] : ['origin/main', 'origin/master', 'origin/develop', 'main', 'master'];
  for (const ref of candidates) {
    const mergeBase = git('merge-base', ref, 'HEAD');
    if (mergeBase) return { ref, mergeBase };
  }
  return { ref: asked || null, mergeBase: null };
}

const pkgPath = join(root, 'package.json');
if (!existsSync(pkgPath)) {
  console.log(JSON.stringify({ error: 'package.json が見つかりません。--root でフロントエンドのパッケージを指定してください。' }, null, 2));
  process.exit(1);
}
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const deps = { ...pkg.dependencies, ...pkg.devDependencies };
const scripts = pkg.scripts ?? {};
const has = (file) => existsSync(join(root, file));

const packageManager = has('pnpm-lock.yaml')
  ? 'pnpm'
  : has('yarn.lock')
    ? 'yarn'
    : has('bun.lock') || has('bun.lockb')
      ? 'bun'
      : 'npm';
const run = (name) => `${packageManager} run ${name}`;
const pickScript = (...names) => names.find((n) => scripts[n]);

const major = (range) => {
  const m = /(\d+)/.exec(range ?? '');
  return m ? Number(m[1]) : null;
};

const typecheckScript = pickScript('typecheck', 'type-check', 'check-types', 'tsc', 'check');
const lintScript = pickScript('lint', 'lint:check');
const testScript = pickScript('test:unit', 'test', 'unit');
const buildScript = pickScript('build');
const e2eScript = pickScript('test:e2e', 'e2e', 'playwright');
const devScript = pickScript('dev', 'start', 'serve', 'preview');

const commands = {
  typecheck: typecheckScript ? run(typecheckScript) : deps.typescript ? 'npx tsc --noEmit' : null,
  lint: lintScript ? run(lintScript) : null,
  test: testScript ? run(testScript) : null,
  build: buildScript ? run(buildScript) : null,
  e2e: e2eScript ? run(e2eScript) : null,
  dev: devScript ? run(devScript) : null,
};

const framework =
  ['next', 'nuxt', '@remix-run/react', 'astro', '@sveltejs/kit', 'react', 'vue', 'svelte', 'solid-js', 'preact'].find(
    (name) => deps[name],
  ) ?? null;

// プロジェクトが node_modules/.bin に Node.js を持っていれば、npm scripts と npx はそちらを使う。
function projectNodeVersion() {
  const local = join(root, 'node_modules', '.bin', 'node');
  if (!existsSync(local)) return null;
  try {
    return execFileSync(local, ['-p', 'process.versions.node'], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}
const localNode = projectNodeVersion();
const nodeVersion = localNode ?? process.versions.node;
const nodeMajor = Number(nodeVersion.split('.')[0]);
const vitestMajor = major(deps.vitest);
const jestMajor = major(deps.jest);
const usesVitePlus = Boolean(deps['vite-plus']);
const runner = vitestMajor || usesVitePlus ? 'vitest' : jestMajor ? 'jest' : null;

// プロジェクトが自分で決めたカバレッジの基準（しきい値）があるか。あればそれが「どこまでテストを求めるか」の基準になる。
function detectCoverage() {
  const configs = ['vitest.config.ts', 'vitest.config.mts', 'vitest.config.js', 'vitest.config.mjs', 'vite.config.ts', 'vite.config.mts',
    'vite.config.js', 'vite.config.mjs', 'jest.config.ts', 'jest.config.js', 'jest.config.mjs', 'jest.config.cjs', 'jest.config.json', '.nycrc', '.nycrc.json', '.c8rc.json'];
  let thresholdFile = null;
  for (const file of configs) {
    if (!has(file)) continue;
    const text = readFileSync(join(root, file), 'utf8');
    if (/\bthresholds?\s*:|coverageThreshold|"(?:check-coverage|branches|lines|functions|statements)"\s*:/.test(text)) {
      thresholdFile = file;
      break;
    }
  }
  if (!thresholdFile && pkg.jest?.coverageThreshold) thresholdFile = 'package.json (jest.coverageThreshold)';
  if (!thresholdFile && (pkg.c8?.['check-coverage'] || pkg.nyc?.['check-coverage'])) thresholdFile = 'package.json (c8 / nyc)';
  const script = pickScript('test:coverage', 'coverage', 'test:cov', 'test:ci');
  const provider = ['@vitest/coverage-v8', '@vitest/coverage-istanbul', 'c8', 'nyc'].find((name) => deps[name]) ?? (deps.jest ? 'jest' : null);
  let command = null;
  if (script) command = run(script);
  else if (thresholdFile && deps.vitest && provider) command = 'npx vitest run --coverage';
  else if (thresholdFile && deps.jest) command = 'npx jest --coverage';
  return {
    thresholdsConfigured: Boolean(thresholdFile),
    thresholdFile,
    provider,
    command,
    note: thresholdFile
      ? command
        ? 'しきい値が設定されている。段階 1 でこのコマンドを実行し、不合格なら blocker。'
        : 'しきい値は設定されているが、実行手段（カバレッジの provider かスクリプト）が見つからない。未実施として報告する。'
      : 'しきい値の設定なし。カバレッジはプロジェクトの条件ではない。',
  };
}
const coverage = detectCoverage();

const blockers = [];
if (nodeMajor < 24) blockers.push(`Node.js ${nodeVersion} で実行中（mutator は 24 以上が必要）`);
if (runner === 'vitest' && !usesVitePlus && vitestMajor < 5) blockers.push(`Vitest ${vitestMajor}（mutator は 5 が必要）`);
if (runner === 'jest') blockers.push('Jest は ESM モードのみの実験的対応のため既定では使わない');
if (!runner) blockers.push('Vitest も Jest も見つからない');

// Playwright はプロジェクトの依存になくても、環境に入っていれば段階 6 に使える。
function locatePlaywright() {
  if (deps['@playwright/test'] || deps.playwright || has('node_modules/playwright')) return 'project';
  try {
    // NODE_PATH やグローバルに入っているもの
    createRequire(import.meta.url).resolve('playwright');
    return 'environment';
  } catch {
    return null;
  }
}

// package.json の engines.node と、実行中の Node の食い違い。単純な範囲（26.x、^26、>=24）だけ判定する。
function checkEngines() {
  const range = pkg.engines?.node;
  if (!range) return null;
  const m = /^\s*(>=|\^|~)?\s*v?(\d+)(?:\.[\dx*]+)*\s*$/.exec(range);
  if (!m) return { node: range, satisfied: null, note: '範囲を判定できない。実行中の Node が合っているか確かめる。' };
  const want = Number(m[2]);
  const satisfied = m[1] === '>=' ? nodeMajor >= want : nodeMajor === want;
  return {
    node: range,
    satisfied,
    note: satisfied ? null : `プロジェクトの指定は Node ${range}、実行中は ${nodeVersion}。合わせられなければレポートに書く。`,
  };
}

const base = resolveBase();
// 検証自身の作業ファイルは変更に数えない。
const ownFiles = /^(\.dokumi|\.mutator)\//;
const changed = base.mergeBase
  ? [
      ...git('diff', '--name-only', base.mergeBase).split('\n'),
      ...git('ls-files', '--others', '--exclude-standard').split('\n'),
    ].filter((f) => f && !ownFiles.test(f))
  : [];
const uiPattern = /\.(tsx|jsx|vue|svelte|astro|css|scss|sass|less|html|mdx)$|(^|\/)(tailwind|postcss)\.config\./;
const testPattern = /(\.|\/)(test|spec)\.[cm]?[jt]sx?$|(^|\/)__tests__\//;

console.log(
  JSON.stringify(
    {
      root,
      packageManager,
      framework,
      commands,
      base,
      node: nodeVersion,
      nodeSource: localNode ? 'node_modules/.bin/node（npm scripts と npx が使う）' : 'PATH',
      engines: checkEngines(),
      testRunner: runner,
      coverage,
      mutator: {
        eligible: blockers.length === 0,
        installed: Boolean(deps['@mizchi/mutator']),
        installedRange: deps['@mizchi/mutator'] ?? null,
        reasons: blockers,
      },
      playwrightInstalled: Boolean(deps['@playwright/test'] || deps.playwright),
      // project: プロジェクトの依存から読める / environment: 環境に入っているものを使える / null: どちらにもない
      playwrightAvailable: locatePlaywright(),
      diff: {
        files: changed.length,
        all: changed,
        touchesUi: changed.some((f) => uiPattern.test(f)),
        uiFiles: changed.filter((f) => uiPattern.test(f)),
        testFiles: changed.filter((f) => testPattern.test(f)),
        sourceFiles: changed.filter((f) => /\.[cm]?[jt]sx?$/.test(f) && !testPattern.test(f)),
      },
    },
    null,
    2,
  ),
);
