#!/usr/bin/env node
// Markdown の中の Mermaid の図（```mermaid のブロック）を、実際に描画して確かめる。
// 記法が崩れた図は、GitHub ではエラーの表示になる。レポートに図を付けたら、渡す前にこれを通す。
//
// 使い方: node check-mermaid.mjs <file.md>... [--out <dir>]
//   描画できた図は <dir>/diagram-<番号>.png に保存する（既定: .dokumi/shots）。保存した画像は自分で開いて見る。
//   MERMAID_PATH  mermaid.min.js の場所（既定: .dokumi/tools/mermaid/package/dist/mermaid.min.js）
//   CHROME_PATH   Chromium の実行ファイル（Playwright が自分のブラウザを見つけられないとき）
// 終了コード: 0 = 全部描画できた（図が 1 つもない場合も 0）, 1 = 描画できない図がある, 2 = 実行できなかった
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const files = [];
let outDir = resolve('.dokumi/shots');
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--out') outDir = resolve(process.argv[++i] ?? '.');
  else files.push(process.argv[i]);
}
const fail = (message) => {
  console.log(JSON.stringify({ error: message }, null, 2));
  process.exit(2);
};
if (files.length === 0) fail('Markdown のファイルを指定してください。');

// ブロックを取り出す。箇条書きの中に字下げして置かれたブロックは、字下げを除いて読む。
const blocks = [];
for (const file of files) {
  if (!existsSync(file)) fail(`ファイルがありません: ${file}`);
  const lines = readFileSync(file, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const open = /^(\s*)(`{3,}|~{3,})mermaid\s*$/.exec(lines[i]);
    if (!open) continue;
    const [, indent, fence] = open;
    const body = [];
    let j = i + 1;
    for (; j < lines.length && lines[j].trim() !== fence; j++) body.push(lines[j].startsWith(indent) ? lines[j].slice(indent.length) : lines[j]);
    blocks.push({ file, line: i + 1, closed: j < lines.length, text: body.join('\n') });
    i = j;
  }
}
if (blocks.length === 0) {
  console.log(JSON.stringify({ diagrams: 0, results: [] }, null, 2));
  process.exit(0);
}

const mermaidPath = process.env.MERMAID_PATH ?? '.dokumi/tools/mermaid/package/dist/mermaid.min.js';
if (!existsSync(mermaidPath)) fail(`mermaid.min.js がありません: ${mermaidPath}（references/report-format.md の「図を確かめる」の手順で取得する）`);
let chromium;
try {
  // プロジェクトか環境（NODE_PATH）に入っている Playwright を使う。
  ({ chromium } = createRequire(join(process.cwd(), 'noop.js'))('playwright'));
} catch {
  fail('Playwright が見つかりません。プロジェクトの依存か NODE_PATH に必要です。');
}

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: 2 });
await page.setContent('<!doctype html><html lang="ja"><body style="margin:16px;background:#fff"><div id="out"></div></body></html>');
await page.addScriptTag({ path: mermaidPath });
await page.evaluate(() => window.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' }));

const results = [];
for (const [index, block] of blocks.entries()) {
  const where = { file: block.file, line: block.line };
  if (!block.closed) {
    results.push({ ...where, ok: false, error: 'ブロックが閉じていない' });
    continue;
  }
  const rendered = await page.evaluate(async ({ text, id }) => {
    try {
      const { svg } = await window.mermaid.render(id, text);
      document.getElementById('out').innerHTML = svg;
      return { ok: true };
    } catch (error) {
      document.getElementById(`d${id}`)?.remove(); // 失敗時に mermaid が残す要素
      return { ok: false, error: String(error?.message ?? error).split('\n').slice(0, 4).join(' / ') };
    }
  }, { text: block.text, id: `diagram${index + 1}` });
  if (rendered.ok) {
    const image = join(outDir, `diagram-${index + 1}.png`);
    await page.locator('#out svg').screenshot({ path: image });
    results.push({ ...where, ok: true, image });
  } else results.push({ ...where, ...rendered });
}
await browser.close();
console.log(JSON.stringify({ diagrams: blocks.length, results }, null, 2));
process.exit(results.every((r) => r.ok) ? 0 : 1);
