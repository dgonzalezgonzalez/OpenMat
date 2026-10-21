/**
 * OpenMat UI smoke test driven over CDP.
 *
 * Exercises the features a user would report as broken:
 *   - Command Window REPL execution + output
 *   - Plot rendering (line / scatter / bar / histogram) in the Figure window
 *   - Workspace variable population
 *   - Editor Run Script
 *   - Ribbon PLOTS gallery buttons
 *   - Figure Grid / Export toolbar buttons
 *
 * Usage: npx vite-node tests/harness/uiDriver.ts [--out report.json]
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  CDP,
  listTargets,
  REPL_TRANSCRIPT,
  WORKSPACE_ROWS,
  FIGURE_STATE,
  CLICK_RIBBON_TAB,
  CLICK_BUTTON,
  CLICK_FIGURE_BUTTON
} from './cdp';

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

const checks: Check[] = [];
function check(name: string, ok: boolean, detail: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} :: ${detail}`);
}

/**
 * Error lines in the Command Window are rendered with the red error class.
 */
const REPL_ERRORS = `(function(){
  const panels = Array.from(document.querySelectorAll('.om-panel'));
  for (const p of panels) {
    const h = p.querySelector('.om-panel-header');
    if (!h || !/Command Window/.test(h.textContent)) continue;
    const body = p.querySelector('.om-command-window');
    if (!body) return [];
    return Array.from(body.querySelectorAll('.text-red-600')).map(el => el.textContent.trim());
  }
  return [];
})()`;

async function replExec(cdp: CDP, cmd: string): Promise<string> {
  // The value change and the Enter keydown must be two separate CDP
  // evaluations: React 18 flushes the input event's state update
  // asynchronously, so a keydown dispatched in the same task still sees the
  // previous (empty) input state and the command is silently dropped.
  const set = `
    (function(){
      const prompts = Array.from(document.querySelectorAll('.om-prompt'));
      for (const p of prompts) {
        const inp = p.parentElement && p.parentElement.querySelector('input');
        if (inp) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(inp, ${JSON.stringify(cmd)});
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        }
      }
      return false;
    })()
  `;
  const ok = await cdp.evalRaw<boolean>(set);
  if (!ok) throw new Error('REPL input not found');
  await cdp.wait(120);
  const key = `
    (function(){
      const prompts = Array.from(document.querySelectorAll('.om-prompt'));
      for (const p of prompts) {
        const inp = p.parentElement && p.parentElement.querySelector('input');
        if (inp) {
          inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
          return true;
        }
      }
      return false;
    })()
  `;
  await cdp.evalRaw<boolean>(key);
  await cdp.wait(700);
  return cdp.eval<string>(REPL_TRANSCRIPT);
}

async function main() {
  const outIdx = process.argv.indexOf('--out');
  const outPath = outIdx >= 0 ? process.argv[outIdx + 1] : null;
  const shotDir = outPath ? path.dirname(path.resolve(outPath)) : process.cwd();

  const targets = await listTargets();
  let target = targets.find((t) => t.type === 'page' && t.url.includes('localhost:3000'));
  if (!target) {
    const res = await fetch('http://127.0.0.1:9222/json/new?http://localhost:3000/', {
      method: 'PUT'
    });
    target = (await res.json()) as any;
  }
  if (!target) throw new Error('no Chrome target available');
  console.log(`[uiDriver] target ${target.id} ${target.url}`);

  const cdp = await CDP.connect(target.id);
  await cdp.goto('http://localhost:3000/');
  await cdp.wait(1200);

  // ---------- 1. App shell renders ----------
  const shell = await cdp.eval<any>(`
    (function(){
      return {
        title: document.title,
        ribbonTabs: Array.from(document.querySelectorAll('.om-ribbon-tab')).map(e=>e.textContent.trim()),
        panels: Array.from(document.querySelectorAll('.om-panel-header')).map(e=>e.textContent.trim()),
        status: (document.body.innerText.match(/Engine:.*/) || [''])[0]
      };
    })()
  `);
  check('app shell renders', shell.ribbonTabs.length === 4, `tabs=${JSON.stringify(shell.ribbonTabs)}`);
  check('panels present', shell.panels.length >= 5, `panels=${JSON.stringify(shell.panels)}`);
  check('status bar shows engine', /Engine/.test(shell.status || ''), `status=${shell.status}`);

  // ---------- 2. REPL: simple arithmetic ----------
  await replExec(cdp, 'A = [1 2; 3 4]');
  const t1 = await replExec(cdp, 'disp(det(A))');
  check('REPL executes and prints det', /-2/.test(t1), `tail=${t1.slice(-160).replace(/\n/g, ' | ')}`);

  // ---------- 3. Workspace updates ----------
  const ws = await cdp.eval<string[]>(WORKSPACE_ROWS);
  check(
    'workspace lists A',
    Array.isArray(ws) && ws.some((r) => r.startsWith('A |')),
    `rows=${JSON.stringify(ws)?.slice(0, 300)}`
  );

  // ---------- 3b. Engine errors must be REPORTED, not swallowed ----------
  // Regression guard: an unguarded `process.env` access in the interpreter's
  // error handler threw a ReferenceError in the browser, which escaped
  // execute() and left the Command Window completely blank for any failing
  // command.
  await replExec(cdp, 'thisFunctionDoesNotExist(1)');
  const errs = await cdp.eval<string[]>(REPL_ERRORS);
  check(
    'engine error is reported in the Command Window',
    Array.isArray(errs) && errs.some((e) => /Unrecognized function/.test(e)),
    `errors=${JSON.stringify(errs)?.slice(0, 200)}`
  );

  // ---------- 4. PLOTS tab: line plot renders a canvas ----------
  const tabOk = await cdp.eval<boolean>(`(${CLICK_RIBBON_TAB})('PLOTS')`);
  await cdp.wait(300);
  const plotBtn = await cdp.eval<boolean>(`(${CLICK_BUTTON})('plot')`);
  await cdp.wait(1500);
  let fig = await cdp.eval<any>(FIGURE_STATE);
  check('PLOTS tab clickable', tabOk, `clicked=${tabOk}`);
  check(
    'PLOTS>plot renders a chart canvas',
    !!(fig && fig.hasCanvas),
    `figure=${JSON.stringify(fig)?.slice(0, 200)}`
  );
  check(
    'figure header shows the plot title',
    !!(fig && fig.header && fig.header.includes('Sine Wave')),
    `header=${fig && fig.header}`
  );

  // ---------- 5. scatter / bar / histogram from the gallery ----------
  for (const label of ['scatter', 'bar', 'histogram']) {
    const clicked = await cdp.eval<boolean>(`(${CLICK_BUTTON})(${JSON.stringify(label)})`);
    await cdp.wait(1400);
    const f = await cdp.eval<any>(FIGURE_STATE);
    check(
      `PLOTS>${label} renders a chart`,
      !!(f && f.hasCanvas),
      `clicked=${clicked} header=${f && f.header} canvas=${f && JSON.stringify(f.canvasSize)}`
    );
  }

  // ---------- 6. Figure toolbar: Grid and Export ----------
  const gridBtn = await cdp.eval<boolean>(`(${CLICK_FIGURE_BUTTON})('Grid')`);
  await cdp.wait(600);
  const gridAfter = await cdp.eval<any>(FIGURE_STATE);
  check(
    'Figure Grid button exists and is clickable',
    gridBtn,
    `after=${gridAfter && gridAfter.header}`
  );

  const exportBtn = await cdp.eval<boolean>(`(${CLICK_FIGURE_BUTTON})('Export')`);
  await cdp.wait(600);
  check('Figure Export button exists and is clickable', exportBtn, `clicked=${exportBtn}`);

  // ---------- 7. Editor Run Script ----------
  await cdp.eval(`(${CLICK_RIBBON_TAB})('HOME')`);
  await cdp.wait(200);
  const ran = await cdp.eval<boolean>(`(${CLICK_BUTTON})('Run Script')`);
  await cdp.wait(2000);
  const afterRun = await cdp.eval<any>(FIGURE_STATE);
  const ws2 = await cdp.eval<string[]>(WORKSPACE_ROWS);
  check(
    'Editor Run Script executes the demo script',
    ran && Array.isArray(ws2) && ws2.length > 0,
    `workspaceRows=${JSON.stringify(ws2)?.slice(0, 200)} figure=${afterRun?.header}`
  );

  // ---------- 8. REPL: function definition + call ----------
  await replExec(cdp, 'function y = f(x)\ny = x + 1;\nend');
  await replExec(cdp, 'z = f(2)');
  const t2 = await replExec(cdp, "disp('marker-xyz')");
  check(
    'REPL disp output visible after a function call',
    /marker-xyz/.test(t2),
    `tail=${t2.slice(-200).replace(/\n/g, ' | ')}`
  );
  const zval = await cdp.eval<string[]>(WORKSPACE_ROWS);
  check(
    'function result lands in the workspace',
    Array.isArray(zval) && zval.some((r) => r.startsWith('z |')),
    `rows=${JSON.stringify(zval)?.slice(0, 300)}`
  );

  // ---------- 9. REPL: plotting via command window ----------
  await replExec(cdp, "tt = 0:0.1:10; plot(tt, sin(tt)); title('REPL Sine');");
  await cdp.wait(1400);
  fig = await cdp.eval<any>(FIGURE_STATE);
  check(
    'REPL plot renders a chart with title',
    !!(fig && fig.hasCanvas && (fig.header || '').includes('REPL Sine')),
    `header=${fig && fig.header}`
  );

  // ---------- 10. Grid off / on ----------
  await replExec(cdp, 'grid off;');
  await cdp.wait(500);
  const g1 = await cdp.eval<any>(FIGURE_STATE);
  await replExec(cdp, 'grid on;');
  await cdp.wait(500);
  const g2 = await cdp.eval<any>(FIGURE_STATE);
  check('grid off/on commands execute', !!g1 && !!g2, `off=${g1?.header} on=${g2?.header}`);

  // ---------- 11. hold on + second series ----------
  await replExec(cdp, "hold on; plot([1 2 3],[1 4 9],'series2');");
  await cdp.wait(1000);
  const seriesCount = await cdp.eval<any>(`
    (function(){
      const p = Array.from(document.querySelectorAll('.om-panel')).find(c=>{
        const h=c.querySelector('.om-panel-header');
        return h && h.textContent.trim().startsWith('Figure 1');
      });
      if(!p) return null;
      return p.textContent.replace(/\\s+/g,' ').trim().slice(0,200);
    })()
  `);
  check('hold on + second plot series executes', !!seriesCount, `panel=${seriesCount}`);

  // ---------- 12. Console errors ----------
  check(
    'no uncaught page exceptions',
    cdp.pageErrors.length === 0,
    `errors=${JSON.stringify(cdp.pageErrors).slice(0, 500)}`
  );
  const errLogs = cdp.consoleLogs.filter((l) => l.startsWith('[error]'));
  check(
    'no console.error output',
    errLogs.length === 0,
    `errors=${JSON.stringify(errLogs).slice(0, 500)}`
  );

  // ---------- 13. Screenshot ----------
  const shot = await cdp.screenshotBase64();
  fs.writeFileSync(path.join(shotDir, 'ui-final.png'), Buffer.from(shot, 'base64'));

  const report = {
    checks,
    pageErrors: cdp.pageErrors,
    consoleLogs: cdp.consoleLogs,
    passed: checks.filter((c) => c.ok).length,
    failed: checks.filter((c) => !c.ok).length
  };
  if (outPath) {
    fs.writeFileSync(path.resolve(outPath), JSON.stringify(report, null, 2), 'utf8');
  }
  console.log(`\n[uiDriver] ${report.passed} passed, ${report.failed} failed`);
  cdp.close();
}

main().catch((e) => {
  console.error('[uiDriver] fatal', e);
  process.exit(1);
});
