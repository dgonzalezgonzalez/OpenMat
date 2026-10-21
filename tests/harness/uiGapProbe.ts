/**
 * OpenMat UI gap probe.
 *
 * Runs a list of MATLAB snippets in the real Command Window over CDP and
 * records whether the engine accepted them. This is the evidence behind the
 * "what does not work in the UI" report.
 *
 * Usage: npx vite-node tests/harness/uiGapProbe.ts [--out report.json]
 */
import * as fs from 'node:fs';
import { CDP, listTargets, REPL_TRANSCRIPT } from './cdp';

interface Probe {
  snippet: string;
  category: string;
  outcome: 'ok' | 'error';
  detail: string;
}

const PROBES: { category: string; snippet: string }[] = [
  { category: 'core', snippet: 'a = 1 + 2' },
  { category: 'core', snippet: 'disp(pi)' },
  { category: 'graphics', snippet: 'x = 0:0.1:10; plot(x, sin(x))' },
  { category: 'graphics', snippet: 'figure' },
  { category: 'graphics', snippet: 'hold on' },
  { category: 'graphics', snippet: 'grid on' },
  { category: 'graphics', snippet: 'title("t")' },
  { category: 'graphics', snippet: 'xlabel("x")' },
  { category: 'graphics', snippet: 'ylabel("y")' },
  { category: 'graphics', snippet: 'axis([0 1 0 1])' },
  { category: 'graphics', snippet: 'legend("a")' },
  { category: 'graphics', snippet: 'subplot(2,1,1)' },
  { category: 'graphics', snippet: 'clf' },
  { category: 'graphics', snippet: 'close all' },
  { category: 'graphics', snippet: 'gcf' },
  { category: 'graphics', snippet: 'set(gcf, "Color", "w")' },
  { category: 'graphics', snippet: 'print("f.png")' },
  { category: 'graphics', snippet: 'scatter(1:3, 1:3)' },
  { category: 'graphics', snippet: 'bar(1:3)' },
  { category: 'graphics', snippet: 'histogram(randn(100,1))' },
  { category: 'graphics', snippet: 'semilogy(1:10, 1:10)' },
  { category: 'graphics', snippet: 'area([1 2 3])' },
  { category: 'graphics', snippet: 'pie([1 2 3])' },
  { category: 'graphics', snippet: 'stem(1:3)' },
  { category: 'graphics', snippet: 'contour(zeros(3))' },
  { category: 'graphics', snippet: 'surf(zeros(3))' },
  { category: 'graphics', snippet: 'imagesc(zeros(3))' },
  { category: 'graphics', snippet: '3dplot([1 2 3])' },
  { category: 'data', snippet: 'c = cell(1,3)' },
  { category: 'data', snippet: 'load("data.mat")' },
  { category: 'data', snippet: 'save("out.mat")' },
  { category: 'data', snippet: 'T = table([1 2 3])' },
  { category: 'data', snippet: 'd = dictionary("a", 1)' },
  { category: 'data', snippet: 's = struct("a", 1)' },
  { category: 'data', snippet: 'f = @(x) x.^2' },
  { category: 'data', snippet: 'x = linspace(0,1,10)' },
  { category: 'data', snippet: 'x = logspace(0,1,10)' },
  { category: 'data', snippet: 'x = 1:0.5:3' },
  { category: 'language', snippet: 'for k = 1:3, disp(k); end' },
  { category: 'language', snippet: 'if true, disp("y"); end' },
  { category: 'language', snippet: 'switch 1, case 1, disp("a"); end' },
  { category: 'language', snippet: 'try, disp("t"); catch, end' },
  { category: 'language', snippet: 'f = @(x) x + 1; disp(f(2))' },
  { category: 'language', snippet: 'function y = g(x), y = x; end' },
  { category: 'language', snippet: 'x = 1; while x < 3, x = x + 1; end' },
];

/** Error lines in the Command Window are rendered with the red error class. */
const REPL_ERRORS = `(function(){
  const panels = Array.from(document.querySelectorAll('.om-panel'));
  for (const p of panels) {
    const h = p.querySelector('.om-panel-header');
    if (!h || !/Command Window/.test(h.textContent)) continue;
    const body = p.querySelector('.om-command-window');
    if (!body) return [];
    return Array.from(body.querySelectorAll('.text-red-600'))
      .map(el => el.textContent.trim());
  }
  return [];
})()`;

async function replExec(cdp: CDP, cmd: string): Promise<string> {
  // React 18 flushes discrete events synchronously per dispatch, but a value
  // change and the Enter keydown must be separate CDP evaluations or the
  // keydown handler still sees the previous (empty) input state.
  const set = `(function(){
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
  })()`;
  const ok = await cdp.evalRaw<boolean>(set);
  if (!ok) throw new Error('REPL input not found');
  await cdp.wait(120);
  const key = `(function(){
    const prompts = Array.from(document.querySelectorAll('.om-prompt'));
    for (const p of prompts) {
      const inp = p.parentElement && p.parentElement.querySelector('input');
      if (inp) {
        inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        return true;
      }
    }
    return false;
  })()`;
  await cdp.evalRaw<boolean>(key);
  await cdp.wait(600);
  return cdp.eval<string>(REPL_TRANSCRIPT);
}

async function main() {
  const targets = await listTargets();
  const page = targets.find(t => t.type === 'page' && t.url.includes('localhost:3000')) ?? targets[0];
  if (!page) throw new Error('no browser target found');
  const cdp = await CDP.connect(page.id);
  await cdp.goto('http://localhost:3000/');
  await cdp.wait(1500);

  const results: Probe[] = [];
  for (const p of PROBES) {
    let detail = '';
    let outcome: 'ok' | 'error' = 'ok';
    try {
      const before = await cdp.eval<string[]>(REPL_ERRORS);
      const beforeSet = new Set(before ?? []);
      await replExec(cdp, p.snippet);
      const after = (await cdp.eval<string[]>(REPL_ERRORS)) ?? [];
      const fresh = after.filter(e => !beforeSet.has(e));
      if (fresh.length) {
        outcome = 'error';
        detail = fresh.join(' | ').slice(0, 160);
      } else {
        const transcript = await cdp.eval<string>(REPL_TRANSCRIPT);
        const tail = (transcript ?? '')
          .split('\n')
          .map(s => s.trim())
          .filter(Boolean)
          .slice(-1)[0];
        detail = (tail ?? '(no output)').slice(0, 160);
      }
    } catch (e) {
      outcome = 'error';
      detail = String(e).slice(0, 160);
    }
    results.push({ snippet: p.snippet, category: p.category, outcome, detail });
    console.log(`${outcome === 'ok' ? 'OK   ' : 'FAIL '} ${p.snippet.padEnd(42)} :: ${detail}`);
  }

  const out = process.argv.includes('--out')
    ? process.argv[process.argv.indexOf('--out') + 1]
    : '/tmp/openmat-gates/uigap.json';
  fs.writeFileSync(out, JSON.stringify(results, null, 2));
  console.log(`\nwrote ${out}  (${results.filter(r => r.outcome === 'error').length} failures of ${results.length})`);
  cdp.close();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
