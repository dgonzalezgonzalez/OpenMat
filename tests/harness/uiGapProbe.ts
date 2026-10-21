/**
 * OpenMat UI gap probe.
 *
 * Runs a list of MATLAB snippets in the real Command Window over CDP and
 * records whether the engine accepted them. This is the evidence behind the
 * "what does not work in the UI" report, and it is the tool that found the
 * swallowed-error bug: an engine error used to leave the Command Window
 * completely blank, so the probe saw *no* output and no error.
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
  // --- control: these must work, otherwise the probe itself is broken ---
  { category: 'control', snippet: 'a = 1 + 2' },
  { category: 'control', snippet: 'disp(pi)' },
  { category: 'control', snippet: 'x = 0:0.1:10; plot(x, sin(x))' },
  { category: 'control', snippet: 'if true, disp("ok"); end' },
  { category: 'control', snippet: 'f = @(x) x + 1; disp(f(2))' },
  { category: 'control', snippet: 'disp("marker-xyz")' },

  // --- graphics: implemented ---
  { category: 'graphics', snippet: 'figure' },
  { category: 'graphics', snippet: 'hold on' },
  { category: 'graphics', snippet: 'grid on' },
  { category: 'graphics', snippet: 'title("t")' },
  { category: 'graphics', snippet: 'xlabel("x")' },
  { category: 'graphics', snippet: 'ylabel("y")' },
  { category: 'graphics', snippet: 'scatter(1:3, 1:3)' },
  { category: 'graphics', snippet: 'bar(1:3)' },
  { category: 'graphics', snippet: 'histogram(randn(100,1))' },

  // --- graphics: NOT implemented ---
  { category: 'graphics', snippet: 'axis([0 1 0 1])' },
  { category: 'graphics', snippet: 'legend("a")' },
  { category: 'graphics', snippet: 'subplot(2,1,1)' },
  { category: 'graphics', snippet: 'axes' },
  { category: 'graphics', snippet: 'clf' },
  { category: 'graphics', snippet: 'close all' },
  { category: 'graphics', snippet: 'gcf' },
  { category: 'graphics', snippet: 'gca' },
  { category: 'graphics', snippet: 'set(gcf, "Color", "w")' },
  { category: 'graphics', snippet: 'get(gcf)' },
  { category: 'graphics', snippet: 'print("f.png")' },
  { category: 'graphics', snippet: 'semilogx(1:10, 1:10)' },
  { category: 'graphics', snippet: 'semilogy(1:10, 1:10)' },
  { category: 'graphics', snippet: 'loglog(1:10, 1:10)' },
  { category: 'graphics', snippet: 'area([1 2 3])' },
  { category: 'graphics', snippet: 'pie([1 2 3])' },
  { category: 'graphics', snippet: 'stem(1:3)' },
  { category: 'graphics', snippet: 'contour(zeros(3))' },
  { category: 'graphics', snippet: 'surf(zeros(3))' },
  { category: 'graphics', snippet: 'mesh(zeros(3))' },
  { category: 'graphics', snippet: 'imagesc(zeros(3))' },
  { category: 'graphics', snippet: 'plot3([1 2 3])' },
  { category: 'graphics', snippet: 'zlabel("z")' },
  { category: 'graphics', snippet: 'waterfall(zeros(3))' },
  { category: 'graphics', snippet: 'fill([1 2 3],[1 2 3],[0 0 0])' },
  { category: 'graphics', snippet: 'patch([1 2 3],[1 2 3],[0 0 0])' },
  { category: 'graphics', snippet: 'quiver([1 2 3])' },
  { category: 'graphics', snippet: 'colorbar' },
  { category: 'graphics', snippet: 'colormap("jet")' },
  { category: 'graphics', snippet: 'rotate3d on' },

  // --- data: implemented ---
  { category: 'data', snippet: 's = struct("a", 1)' },
  { category: 'data', snippet: 'x = linspace(0,1,10)' },
  { category: 'data', snippet: 'x = logspace(0,1,10)' },
  { category: 'data', snippet: 'x = 1:0.5:3' },

  // --- data: NOT implemented ---
  { category: 'data', snippet: 'c = cell(1,3)' },
  { category: 'data', snippet: 'load("data.mat")' },
  { category: 'data', snippet: 'save("out.mat")' },
  { category: 'data', snippet: 'T = table([1 2 3])' },
  { category: 'data', snippet: 'd = dictionary("a", 1)' },
  { category: 'data', snippet: 'c = categorical(["a" "b"])' },
  { category: 'data', snippet: 's = string("abc")' },
  { category: 'data', snippet: 'm = containers.Map' },
  { category: 'data', snippet: 'importdata("f.csv")' },
  { category: 'data', snippet: 'readtable("f.csv")' },
  { category: 'data', snippet: 'writematrix([1 2], "f.csv")' },
  { category: 'data', snippet: 'writetable(T, "f.csv")' },
  { category: 'data', snippet: 'readmatrix("f.csv")' },
  { category: 'data', snippet: 'csvread("f.csv")' },
  { category: 'data', snippet: 'dlmread("f.csv")' },
  { category: 'data', snippet: 'xlsread("f.xls")' },
  { category: 'data', snippet: 't = timetable([1 2], [3 4])' },
  { category: 'data', snippet: 'd = datetime(2020,1,1)' },

  // --- language / numeric: implemented ---
  { category: 'language', snippet: 'for k = 1:3, disp(k); end' },
  { category: 'language', snippet: 'switch 1, case 1, disp("a"); end' },
  { category: 'language', snippet: 'try, disp("t"); catch, end' },
  { category: 'language', snippet: 'function y = g(x), y = x; end' },
  { category: 'language', snippet: 'x = 1; while x < 3, x = x + 1; end' },
  { category: 'language', snippet: 'z = true; disp(z)' },
  { category: 'language', snippet: 'r = randi(10)' },
  { category: 'language', snippet: 'r = randi([2 5], 1, 4)' },
  { category: 'language', snippet: 'r = randperm(10)' },
  { category: 'language', snippet: 'r = randperm(10, 4)' },
  { category: 'language', snippet: 'b = bsxfun(@plus, [1 2], [3 4])' },
  { category: 'language', snippet: 'a = arrayfun(@(x) x.^2, [1 2])' },
  { category: 'language', snippet: 'f = feval("sin", 1)' },
  { category: 'language', snippet: 'g = str2func("sin")' },
  { category: 'language', snippet: 's = dec2bin(5)' },
  { category: 'language', snippet: 'h = hex2dec("FF")' },
  { category: 'language', snippet: 'c = conv([1 2], [1 2])' },
  { category: 'language', snippet: 'c = deconv([1 2], [1 2])' },
  { category: 'language', snippet: 'y = filter([1], [1], [1 2])' },
  { category: 'language', snippet: 'v = interp2([1 2; 3 4], 1.5, 1.5)' },
  { category: 'language', snippet: 'r = fzero(@(x) x.^2-1, [0 2])' },

  // --- language / numeric: NOT implemented ---
  { category: 'language', snippet: 'c = cellfun(@(x) x.^2, {1 2})' },
  { category: 'language', snippet: 'c = num2cell([1 2])' },
  { category: 'language', snippet: 'm = cell2mat({1, 2})' },
  { category: 'language', snippet: 'c = mat2cell([1 2], 1, 2)' },
  { category: 'language', snippet: 'i = int32(7)' },
  { category: 'language', snippet: 'i = uint8(7)' },
  { category: 'language', snippet: 'd = datestr(0)' },
  { category: 'language', snippet: 'n = datenum(0)' },
  { category: 'language', snippet: 't = now' },
  { category: 'language', snippet: 'v = interp3(ones(2,2,2), 1.5, 1.5, 1.5)' },
  { category: 'language', snippet: 'r = fsolve(@(x) x.^2-1, 1)' },
  { category: 'language', snippet: '[t, y] = ode45(@(t,y) y, [0 1], 1)' },
  { category: 'language', snippet: 'function y = om_in(x), y = inputname(1); end; disp(om_in(42))' },
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

/** Read the value of the Command Window's input box. */
const REPL_INPUT_VALUE = `(function(){
  const prompts = Array.from(document.querySelectorAll('.om-prompt'));
  for (const p of prompts) {
    const inp = p.parentElement && p.parentElement.querySelector('input');
    if (inp) return inp.value;
  }
  return null;
})()`;

async function replExec(cdp: CDP, cmd: string): Promise<string> {
  // React 18 flushes the state update from the `input` event asynchronously,
  // so the value change and the Enter keydown must be separate CDP
  // evaluations. The wait for the value to appear in the DOM is what makes
  // this reliable: without it a slow flush silently drops the command, and
  // a dropped command looks exactly like a command that produced no error.
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

  // Wait for React to commit the new input value.
  for (let i = 0; i < 40; i++) {
    const v = await cdp.eval<string | null>(REPL_INPUT_VALUE);
    if (v === cmd) break;
    await cdp.wait(50);
  }

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
  await cdp.wait(500);
  return cdp.eval<string>(REPL_TRANSCRIPT);
}

async function main() {
  const targets = await listTargets();
  const page =
    targets.find((t) => t.type === 'page' && t.url.includes('localhost:3000')) ?? targets[0];
  if (!page) throw new Error('no browser target found');
  const cdp = await CDP.connect(page.id);
  await cdp.goto('http://localhost:3000/');
  await cdp.wait(1500);

  const results: Probe[] = [];
  for (const p of PROBES) {
    let detail = '';
    let outcome: 'ok' | 'error' = 'ok';
    try {
      // Count the error lines rather than comparing sets: two consecutive
      // probes that fail with the same message would otherwise look like
      // "no new error".
      const before = ((await cdp.eval<string[]>(REPL_ERRORS)) ?? []).length;
      await replExec(cdp, p.snippet);
      const after = (await cdp.eval<string[]>(REPL_ERRORS)) ?? [];
      if (after.length > before) {
        outcome = 'error';
        detail = after.slice(before).join(' | ').slice(0, 160);
      } else {
        const transcript = (await cdp.eval<string>(REPL_TRANSCRIPT)) ?? '';
        const tail = transcript
          .split('\n')
          .map((s) => s.trim())
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

  // A summary grouped by category, which is what the gap report reads.
  const byCategory = new Map<string, { ok: number; fail: number }>();
  for (const r of results) {
    const c = byCategory.get(r.category) ?? { ok: 0, fail: 0 };
    if (r.outcome === 'ok') c.ok++;
    else c.fail++;
    byCategory.set(r.category, c);
  }
  console.log('\n=== summary ===');
  for (const [cat, c] of byCategory) {
    console.log(`  ${cat.padEnd(10)} ok=${c.ok} not-implemented=${c.fail}`);
  }
  console.log(
    `\nwrote ${out}  (${results.filter((r) => r.outcome === 'error').length} not implemented of ${results.length})`
  );
  cdp.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
