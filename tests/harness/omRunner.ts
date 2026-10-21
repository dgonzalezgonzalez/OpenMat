/**
 * OpenMat engine runner: executes a suite of .m files through the native engine
 * and emits a JSON report matching the schema produced by matlabRunner.m.
 *
 * Each .m file is split on `%% block` markers. Every block runs in order against
 * a single shared Interpreter, so state carries across blocks exactly like a
 * MATLAB script session.
 *
 * Usage:
 *   npx vite-node tests/harness/omRunner.ts <script.m | suite-dir> [--out result.json]
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Interpreter } from '../../src/engine/interpreter';
import { Matrix } from '../../src/engine/matrix';
import { MatlabRng } from '../../src/engine/rng';
import { isFunctionHandle } from '../../src/engine/types';

export interface BlockReport {
  name: string;
  ok: boolean;
  outputs: string[];
  errors: string[];
  workspace: Record<string, unknown>;
}

export interface ScriptReport {
  script: string;
  blocks: BlockReport[];
}

export interface SuiteReport {
  scripts: ScriptReport[];
}

interface Block {
  name: string;
  code: string;
}

/**
 * Split a capture into the individual lines the command window shows.
 *
 * MATLAB's runner drops blank lines, and MATLAB's `disp` of a character
 * matrix prints one line per row, so the OpenMat side has to be split the
 * same way for the two transcripts to line up.
 */
export function splitOutput(text: string): string[] {
  const lines = text.split('\n').map((l) => l.replace(/[ \t]+$/, ''));
  const kept = lines.filter((l) => l.trim().length > 0);
  return kept.length > 0 ? kept : lines.filter((l) => l.length > 0);
}

/** Split a script into `%% block` sections. */
export function splitBlocks(src: string): Block[] {
  const lines = src.split('\n');
  const blocks: Block[] = [];
  let current: Block | null = null;
  let buf: string[] = [];

  const flush = () => {
    if (current && buf.join('\n').trim().length > 0) {
      current.code = buf.join('\n');
      blocks.push(current);
    } else if (current) {
      current.code = '';
      blocks.push(current);
    }
    buf = [];
  };

  for (const line of lines) {
    const m = /^\s*%%\s*(.*)$/.exec(line);
    if (m) {
      flush();
      current = { name: m[1].trim() || `block_${blocks.length + 1}`, code: '' };
    } else {
      buf.push(line);
    }
  }
  flush();
  if (blocks.length === 0) {
    blocks.push({ name: 'main', code: src });
  }
  return blocks;
}

/**
 * The maximum number of elements serialized per matrix.
 *
 * Some replication blocks build arrays with millions of elements (a
 * `0.01:0.01:34506` grid). Serializing them in full would produce a
 * multi-gigabyte report, so only the leading elements are kept. The
 * matrix shape is always recorded, so the comparator still checks that
 * both engines built the same array.
 */
export const MAX_SERIALIZED_ELEMENTS = 4096;

export function serializeWorkspace(ws: Record<string, any>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ws)) {
    if (v instanceof Matrix && v.isLogical) {
      // A logical array. MATLAB's `class()` reports `logical` for it and the
      // MATLAB runner serializes it as `kind: 'other'` with the flattened
      // row-major data, so both sides have to agree on that shape.
      out[k] = { kind: 'other', value: 'logical', data: v.toFlatArray() };
    } else if (v instanceof Matrix) {
      const flat = v.toFlatArray();
      const kept = flat.slice(0, MAX_SERIALIZED_ELEMENTS);
      // MATLAB's `jsonencode` renders a 1x1 numeric array as a *scalar*, and
      // a non-finite scalar as `null`. The MATLAB side of the harness
      // stores `s.data = [double(val)]` for a scalar, so `jsonencode` gives
      // `null` for a NaN or Inf. Reproduce that exactly: the comparator
      // reads `data: null` as "no elements", so the two sides must agree.
      let data: unknown = kept;
      if (v.rows === 1 && v.cols === 1) {
        const x = kept[0];
        data = x === undefined || (typeof x === 'number' && !Number.isFinite(x))
          ? null
          : x;
      }
      out[k] = {
        kind: 'matrix',
        rows: v.rows,
        cols: v.cols,
        data,
        truncated: flat.length > MAX_SERIALIZED_ELEMENTS,
        text: flat.length > MAX_SERIALIZED_ELEMENTS
          ? `${v.rows}x${v.cols} matrix`
          : v.format()
      };
    } else if (typeof v === 'string') {
      out[k] = { kind: 'string', value: v };
    } else if (Array.isArray(v)) {
      // A cell array. MATLAB's side reports the class name `cell`; both
      // engines must agree on that, and the element list lets the
      // comparator check the contents.
      out[k] = {
        kind: 'other',
        value: 'cell',
        elements: v.map((e) => (e instanceof Matrix ? e.toFlatArray() : e))
      };
    } else if (typeof v === 'boolean') {
      // MATLAB reports a logical scalar through `class()` as `logical`, and
      // its runner serializes it as `kind: 'other'` with the flattened data.
      out[k] = { kind: 'other', value: 'logical', data: [v ? 1 : 0] };
    } else if (typeof v === 'number') {
      // A bare JavaScript number is a 1x1 double in MATLAB, so it has to be
      // serialized as a 1x1 matrix. The previous form
      // (`{kind:'other', value:'number'}`) threw the *value* away, so the
      // comparator could not compare it against MATLAB's matrix and the
      // difference was silently ignored.
      out[k] = {
        kind: 'matrix',
        rows: 1,
        cols: 1,
        data: v,
        text: String(v)
      };
    } else if (isFunctionHandle(v)) {
      // A function handle: MATLAB's `class()` reports `function_handle`, and
      // its runner serializes it the same way.
      out[k] = { kind: 'other', value: 'function_handle' };
    } else if (v && typeof v === 'object' && 'message' in v && 'identifier' in v) {
      // A caught error bound by `catch err`: MATLAB's MException equivalent.
      out[k] = { kind: 'other', value: 'MException' };
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      // A struct: MATLAB's `class()` reports 'struct', so the two sides have
      // to agree on the class name for the comparison to pass.
      out[k] = { kind: 'other', value: 'struct' };
    } else {
      out[k] = { kind: 'other', value: String(v) };
    }
  }
  return out;
}

/**
 * Split a block into executable statements and top-level function definitions.
 *
 * MATLAB requires local functions to appear at the end of a script, so both
 * engines receive the same statement/function split and stay comparable.
 */
export function splitFunctions(code: string): { statements: string; functions: string } {
  const lines = code.split('\n');
  const statements: string[] = [];
  const functions: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const l = lines[i];
    if (/^\s*function\b/i.test(l)) {
      const fnLines: string[] = [];
      let depth = 0;
      let started = false;
      while (i < lines.length) {
        fnLines.push(lines[i]);
        const t = lines[i].trim();
        if (/^function\b/i.test(t)) started = true;
        if (started && t === 'end') {
          depth += 1;
          if (depth === 1) break;
        }
        i += 1;
      }
      functions.push(...fnLines);
    } else {
      statements.push(l);
    }
    i += 1;
  }

  return { statements: statements.join('\n'), functions: functions.join('\n') };
}

/**
 * Execute one .m file through the OpenMat engine.
 *
 * Each block runs in a fresh Interpreter so a block only sees the variables it
 * created itself. This mirrors the MATLAB runner and keeps the comparison
 * between the two engines meaningful.
 *
 * The pseudo-random generator is the exception: MATLAB's `clear` empties the
 * workspace but leaves the generator alone, so the runner threads one
 * generator through every block of a file. Without this the two engines would
 * draw different numbers and the comparison would be meaningless.
 */
export function runScript(
  file: string,
  shared?: Interpreter
): ScriptReport {
  const src = fs.readFileSync(file, 'utf8');
  const blocks = splitBlocks(src);
  const outBlocks: BlockReport[] = [];
  const rng = shared ? shared.getRng() : new MatlabRng();

  for (const block of blocks) {
    const rec: BlockReport = {
      name: block.name,
      ok: true,
      outputs: [],
      errors: [],
      workspace: {}
    };
    const interp = new Interpreter();
    interp.setRng(rng);
    const { statements, functions } = splitFunctions(block.code);
    // Functions are registered first (as MATLAB's script-local functions are
    // hoisted), then the executable statements run.
    const code = functions.trim() ? `${functions}\n${statements}` : statements;
    const res = interp.execute(code);
    // MATLAB's command window writes one line per row, so a multi-line
    // capture has to be split into individual lines to be comparable with
    // the MATLAB runner's `splitOutput`.
    rec.outputs = res.outputs.flatMap((o) => splitOutput(o.text));
    rec.errors = res.outputs.filter((o) => o.isError).map((o) => o.text);
    rec.workspace = serializeWorkspace(res.workspace);
    rec.ok = rec.errors.length === 0;
    outBlocks.push(rec);
  }

  return { script: path.basename(file), blocks: outBlocks };
}

export function runSuiteFiles(
  files: string[],
  interp: Interpreter
): SuiteReport {
  const report: SuiteReport = { scripts: [] };
  for (const f of files) {
    report.scripts.push(runScript(f, interp));
  }
  return report;
}

export function main(): void {
  const argv = process.argv.slice(2);
  const target = argv[0];
  if (!target) {
    console.error('usage: omRunner.ts <script.m | suite-dir> [--out file.json]');
    process.exit(2);
  }
  const outIdx = argv.indexOf('--out');
  const outPath = outIdx >= 0 ? argv[outIdx + 1] : null;

  const stat = fs.statSync(path.resolve(target));
  let files: string[] = [];
  if (stat.isDirectory()) {
    files = fs
      .readdirSync(path.resolve(target))
      .filter((f) => f.endsWith('.m'))
      .sort()
      .map((f) => path.join(path.resolve(target), f));
  } else {
    files = [path.resolve(target)];
  }

  const report = runSuiteFiles(files, new Interpreter());

  const json = JSON.stringify(report, null, 2);
  if (outPath) {
    fs.writeFileSync(path.resolve(outPath), json, 'utf8');
    const total = report.scripts.reduce((n, s) => n + s.blocks.length, 0);
    const failed = report.scripts.reduce(
      (n, s) => n + s.blocks.filter((b) => !b.ok).length,
      0
    );
    console.log(
      `[omRunner] ${report.scripts.length} file(s), ${total} blocks, ${failed} failing -> ${outPath}`
    );
  } else {
    console.log(json);
  }
}
