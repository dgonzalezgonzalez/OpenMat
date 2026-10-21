/**
 * Focused UI probe: verify the Figure canvas actually renders pixels for each
 * plot type, and check the REPL/workspace for the scalar-compare crash.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CDP, listTargets, FIGURE_STATE, WORKSPACE_ROWS, CLICK_RIBBON_TAB, CLICK_BUTTON } from './cdp';

const outIdx = process.argv.indexOf('--out');
const outPath = outIdx >= 0 ? process.argv[outIdx + 1] : null;
const shotDir = outPath ? path.dirname(path.resolve(outPath)) : process.cwd();

async function replExec(cdp: CDP, cmd: string): Promise<string> {
  const set = `
    (function(){
      const prompts = Array.from(document.querySelectorAll('.om-prompt'));
      for (const p of prompts) {
        const inp = p.parentElement && p.parentElement.querySelector('input');
        if (inp) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(inp, ${JSON.stringify(cmd)});
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
          return true;
        }
      }
      return false;
    })()`;
  await cdp.evalRaw<boolean>(set);
  await cdp.wait(800);
  return '';
}

/** Read back the figure canvas pixels and compute a crude "ink" ratio. */
const CANVAS_INK = `
(function(){
  const panels = Array.from(document.querySelectorAll('.om-panel'));
  let p = null;
  for (const cand of panels) {
    const h = cand.querySelector('.om-panel-header');
    if (h && h.textContent.trim().startsWith('Figure 1')) { p = cand; break; }
  }
  if (!p) return null;
  const c = p.querySelector('canvas');
  if (!c) return null;
  const ctx = c.getContext('2d');
  if (!ctx) return { error: 'no 2d context' };
  let d;
  try { d = ctx.getImageData(0, 0, c.width, c.height).data; } catch (e) { return { error: String(e) }; }
  let nonWhite = 0, total = 0;
  for (let i = 0; i < d.length; i += 4) {
    total++;
    if (d[i] < 245 || d[i+1] < 245 || d[i+2] < 245) nonWhite++;
  }
  return { w: c.width, h: c.height, total, nonWhite, ratio: total ? nonWhite/total : 0 };
})()
`;

async function main() {
  const targets = await listTargets();
  const target = targets.find((t) => t.type === 'page' && t.url.includes('localhost:3000'))!;
  const cdp = await CDP.connect(target.id);
  await cdp.goto('http://localhost:3000/');
  await cdp.wait(1200);

  const results: any[] = [];

  // ---- Each gallery plot type, measuring canvas ink ----
  await cdp.eval(`(${CLICK_RIBBON_TAB})('PLOTS')`);
  await cdp.wait(300);
  for (const label of ['plot', 'scatter', 'bar', 'histogram']) {
    await cdp.eval(`(${CLICK_BUTTON})(${JSON.stringify(label)})`);
    await cdp.wait(1600);
    const ink = await cdp.eval<any>(CANVAS_INK);
    const fig = await cdp.eval<any>(FIGURE_STATE);
    const rec = {
      label,
      header: fig?.header,
      canvas: ink,
      rendered: !!(ink && ink.nonWhite > 500)
    };
    results.push(rec);
    console.log(
      `${rec.rendered ? 'PASS' : 'FAIL'}  ${label} :: header=${fig?.header} ink=${
        ink ? `${ink.nonWhite}/${ink.total} (${(ink.ratio * 100).toFixed(2)}%)` : 'null'
      }`
    );
    const shot = await cdp.screenshotBase64();
    fs.writeFileSync(path.join(shotDir, `fig-${label}.png`), Buffer.from(shot, 'base64'));
  }

  // ---- Scalar comparison on a 2-row matrix (engine crash) ----
  await cdp.eval(`(${CLICK_RIBBON_TAB})('HOME')`);
  await cdp.wait(200);
  await replExec(cdp, 'C = [1 2 3; 4 5 6];');
  await replExec(cdp, 'disp(C > 3);');
  await cdp.wait(400);
  const wsRows = await cdp.eval<string[]>(WORKSPACE_ROWS);
  const errText = await cdp.eval<string>(`
    (function(){
      const panels = Array.from(document.querySelectorAll('.om-panel'));
      for (const p of panels) {
        const h = p.querySelector('.om-panel-header');
        if (h && h.textContent.trim().startsWith('Command Window')) {
          const b = p.querySelector('.om-command-window');
          const txt = b ? b.textContent : '';
          const i = txt.lastIndexOf('C > 3');
          return i >= 0 ? txt.slice(i, i + 200) : txt.slice(-200);
        }
      }
      return '';
    })()
  `);
  const crashed = /Cannot read properties of undefined/.test(errText);
  console.log(
    `${crashed ? 'FAIL' : 'PASS'}  scalar compare on 2-row matrix :: ${errText.replace(/\n/g, ' | ').slice(0, 160)}`
  );
  results.push({ label: 'scalar-compare-2row', crashed, errText });

  // ---- Function disp() output ----
  await replExec(cdp, 'function y = ff(x)\ny = x + 1;\ndisp("INSIDE-FUNCTION");\nend');
  await replExec(cdp, 'zz = ff(1);');
  await cdp.wait(500);
  const fnText = await cdp.eval<string>(`
    (function(){
      const panels = Array.from(document.querySelectorAll('.om-panel'));
      for (const p of panels) {
        const h = p.querySelector('.om-panel-header');
        if (h && h.textContent.trim().startsWith('Command Window')) {
          const b = p.querySelector('.om-command-window');
          return b ? b.textContent : '';
        }
      }
      return '';
    })()
  `);
  const fnVisible = /INSIDE-FUNCTION/.test(fnText);
  console.log(
    `${fnVisible ? 'PASS' : 'FAIL'}  function disp() reaches the Command Window :: ${fnVisible ? 'visible' : 'MISSING'}`
  );
  results.push({ label: 'function-disp-visible', visible: fnVisible });

  // ---- Function plot() reaching the Figure ----
  await replExec(cdp, 'function y = pg(x)\ny = x;\nplot([1 2 3],[4 5 6], "FNPLOT");\nend');
  await replExec(cdp, 'pg(1);');
  await cdp.wait(1000);
  const figAfter = await cdp.eval<any>(FIGURE_STATE);
  const fnPlotOk = (figAfter?.header || '').includes('FNPLOT');
  console.log(
    `${fnPlotOk ? 'PASS' : 'FAIL'}  function plot() reaches the Figure :: header=${figAfter?.header}`
  );
  results.push({ label: 'function-plot-visible', ok: fnPlotOk, header: figAfter?.header });

  if (outPath) {
    fs.writeFileSync(path.resolve(outPath), JSON.stringify(results, null, 2), 'utf8');
  }
  cdp.close();
}

main().catch((e) => {
  console.error('fatal', e);
  process.exit(1);
});
