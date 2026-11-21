// axe-core による自動のアクセシビリティ検査を、Playwright のページに対して 1 回実行する。
// 使い方（references/axe.md）:
//   import { scan } from '<このスキルのディレクトリ>/scripts/axe-scan.mjs';
//   const result = await scan(page, '削除の確認ダイアログ');
// axe.min.js の場所は環境変数 AXE_PATH で渡す（既定: .dokumi/tools/package/axe.min.js）。
//
// 返す値: { state, violations, incomplete, measured }
//   violations  axe が違反と判定したもの（impact: critical / serious / moderate / minor）
//   incomplete  axe が判定を保留したもの（「違反なし」ではない）
//   measured    incomplete のうち color-contrast を、計算済みの色から測った結果。
//               ratio が null のものは測れなかった（背景が画像、rgb 以外の色表記など）
import { readFileSync } from 'node:fs';

const axeSource = readFileSync(process.env.AXE_PATH ?? '.dokumi/tools/package/axe.min.js', 'utf8');

// 今表示されている状態を 1 回検査する。state は「初期表示」「削除の確認ダイアログ」のような、状態の名前。
export async function scan(page, state) {
  await page.evaluate(axeSource); // addScriptTag は使わない。CSP の厳しいページでは拒否される
  return page.evaluate(async (state) => {
    const r = await window.axe.run(document, { resultTypes: ['violations', 'incomplete'] });
    const pick = (list) => list.map((v) => ({ id: v.id, impact: v.impact, help: v.help, targets: v.nodes.map((n) => n.target.join(' ')) }));

    // axe が判定を保留した color-contrast を、計算済みの色から測る。
    const parse = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return null; const [r, g, b, a = 1] = m[1].split(/[,\s/]+/).filter(Boolean).map(Number); return { r, g, b, a }; };
    const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
    const lum = (c) => { const f = (v) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
    const ratio = (x, y) => { const [hi, lo] = [lum(x), lum(y)].sort((p, q) => q - p); return (hi + 0.05) / (lo + 0.05); };
    // 要素の背後に見える色の候補。グラデーションは含まれる色をすべて候補にする。背景画像があれば測れない（null）。
    const backgrounds = (el) => {
      const layers = [];
      for (let n = el; n; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.backgroundImage !== 'none') {
          if (!cs.backgroundImage.includes('gradient') || cs.backgroundImage.includes('url(')) return null;
          const stops = [...cs.backgroundImage.matchAll(/rgba?\([^)]+\)/g)].map((m) => parse(m[0]));
          if (stops.length === 0) return null; // rgb 以外の表記（oklch など）
          layers.push(stops);
          if (stops.every((s) => s.a === 1)) break;
        }
        const solid = parse(cs.backgroundColor);
        if (!solid) return null;
        if (solid.a > 0) { layers.push([solid]); if (solid.a === 1) break; }
      }
      let result = [{ r: 255, g: 255, b: 255, a: 1 }]; // どの祖先も不透明でなければ、白い地の上
      while (layers.length > 0) { const top = layers.pop(); result = top.flatMap((t) => result.map((u) => over(t, u))); }
      return result;
    };
    const measured = [];
    for (const node of r.incomplete.filter((v) => v.id === 'color-contrast').flatMap((v) => v.nodes)) {
      const target = node.target.join(' ');
      const el = document.querySelector(target);
      const cs = el && getComputedStyle(el);
      const fg = cs && parse(cs.color);
      const bgs = el && backgrounds(el);
      if (!fg || !bgs) { measured.push({ target, ratio: null }); continue; } // 測れない。未確認として残す
      const worst = Math.min(...bgs.map((bg) => ratio(over(fg, bg), bg)));
      const px = Number.parseFloat(cs.fontSize);
      const required = px >= 24 || (Number(cs.fontWeight) >= 700 && px >= 18.66) ? 3 : 4.5; // WCAG AA。大きい文字は 3
      measured.push({ target, ratio: Math.round(worst * 100) / 100, required, ok: worst >= required });
    }
    return { state, violations: pick(r.violations), incomplete: pick(r.incomplete), measured };
  }, state);
}
