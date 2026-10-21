/**
 * Compare the MATLAB reference report against the OpenMat engine report.
 *
 * Both reports use the schema produced by tests/harness/matlabRunner.m and
 * tests/harness/omRunner.ts:
 *   { scripts: [ { script, blocks: [ { name, ok, outputs, errors, workspace } ] } ] }
 *
 * Usage:
 *   npx vite-node tests/harness/compare.ts --matlab ref.json --openmat om.json [--out diff.json]
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

interface Block {
  name: string;
  ok: boolean;
  outputs: string[];
  errors: string[];
  workspace: Record<string, any>;
}
interface Script {
  script: string;
  blocks: Block[];
}
interface Report {
  scripts: Script[];
}

interface Diff {
  script: string;
  block: string;
  kind:
    | 'matlab-ok-openmat-error'
    | 'openmat-ok-matlab-error'
    | 'both-error'
    | 'output-mismatch'
    | 'value-mismatch'
    | 'only-in-matlab'
    | 'only-in-openmat';
  detail: string;
  matlab?: unknown;
  openmat?: unknown;
}

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

/** Normalize a numeric array for comparison with a tolerance. */
function numClose(a: number, b: number, tol = 1e-9): boolean {
  if (Number.isNaN(a) && Number.isNaN(b)) return true;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return a === b;
  const scale = Math.max(1, Math.abs(a), Math.abs(b));
  return Math.abs(a - b) <= tol * scale;
}

function matrixData(v: any): number[] | null {
  if (!v || typeof v !== 'object' || v.kind !== 'matrix') return null;
  const d = v.data;
  if (Array.isArray(d)) return d as number[];
  if (typeof d === 'number') return [d];
  return [];
}

/** Compare workspace variables shared by both engines. */
function compareWorkspace(
  mb: Record<string, any>,
  ob: Record<string, any>,
  diffs: Diff[],
  script: string,
  block: string
): void {
  for (const key of Object.keys(mb)) {
    if (!(key in ob)) {
      diffs.push({
        script,
        block,
        kind: 'only-in-matlab',
        detail: `variable '${key}' exists in MATLAB but not in OpenMat`
      });
      continue;
    }
    const mv = mb[key];
    const ov = ob[key];
    const mdata = matrixData(mv);
    const odata = matrixData(ov);

    if (mdata && odata) {
      // Both sides truncate very large arrays; compare the shape and the
      // elements that were kept.
      if (mv.rows !== ov.rows || mv.cols !== ov.cols) {
        diffs.push({
          script,
          block,
          kind: 'value-mismatch',
          detail: `variable '${key}' has shape ${mv.rows}x${mv.cols} in MATLAB vs ${ov.rows}x${ov.cols} in OpenMat`,
          matlab: { rows: mv.rows, cols: mv.cols },
          openmat: { rows: ov.rows, cols: ov.cols }
        });
        continue;
      }
      const len = Math.min(mdata.length, odata.length);
      if (mdata.length !== odata.length && !mv.truncated && !ov.truncated) {
        diffs.push({
          script,
          block,
          kind: 'value-mismatch',
          detail: `variable '${key}' has ${mdata.length} elements in MATLAB vs ${odata.length} in OpenMat`,
          matlab: mv,
          openmat: ov
        });
        continue;
      }
      let bad = -1;
      for (let i = 0; i < len; i++) {
        if (!numClose(mdata[i], odata[i])) {
          bad = i;
          break;
        }
      }
      if (bad >= 0) {
        diffs.push({
          script,
          block,
          kind: 'value-mismatch',
          detail: `variable '${key}' differs at element ${bad + 1}: MATLAB=${mdata[bad]} OpenMat=${odata[bad]}`,
          matlab: mv,
          openmat: ov
        });
      }
    } else if (mv?.kind === 'string' && ov?.kind === 'string') {
      if (String(mv.value) !== String(ov.value)) {
        diffs.push({
          script,
          block,
          kind: 'value-mismatch',
          detail: `variable '${key}' differs: MATLAB='${mv.value}' OpenMat='${ov.value}'`,
          matlab: mv,
          openmat: ov
        });
      }
    } else if (mv?.kind === 'string' && ov?.kind !== 'string') {
      diffs.push({
        script,
        block,
        kind: 'value-mismatch',
        detail: `variable '${key}' is char in MATLAB but ${JSON.stringify(ov)} in OpenMat`,
        matlab: mv,
        openmat: ov
      });
    } else if (mdata || odata) {
      // One side is a numeric matrix and the other is not. This used to fall
      // through every branch and be reported as *no difference*, which hid
      // real deviations (a builtin returning a bare JavaScript number where
      // MATLAB returns a 1x1 double). Report it instead of ignoring it.
      diffs.push({
        script,
        block,
        kind: 'value-mismatch',
        detail: `variable '${key}' is a numeric matrix in ${
          mdata ? 'MATLAB' : 'OpenMat'
        } but ${JSON.stringify(mdata ? ov : mv)} in ${
          mdata ? 'OpenMat' : 'MATLAB'
        }`,
        matlab: mv,
        openmat: ov
      });
    } else if (mv?.kind === 'other' && ov?.kind === 'other') {
      if (String(mv.value) !== String(ov.value)) {
        diffs.push({
          script,
          block,
          kind: 'value-mismatch',
          detail: `variable '${key}' class differs: MATLAB=${mv.value} OpenMat=${ov.value}`,
          matlab: mv,
          openmat: ov
        });
      } else if (String(mv.value) === 'cell') {
        // A cell array: the class name agrees, so the contents must too.
        const mEls = (mv as any).elements;
        const oEls = (ov as any).elements;
        if (Array.isArray(mEls) && Array.isArray(oEls)) {
          if (mEls.length !== oEls.length) {
            diffs.push({
              script,
              block,
              kind: 'value-mismatch',
              detail: `variable '${key}' cell length differs: MATLAB=${mEls.length} OpenMat=${oEls.length}`,
              matlab: mv,
              openmat: ov
            });
          } else {
            for (let i = 0; i < mEls.length; i++) {
              const me = mEls[i];
              const oe = oEls[i];
              const same =
                typeof me === 'string' || typeof oe === 'string'
                  ? String(me) === String(oe)
                  : Array.isArray(me) && Array.isArray(oe)
                    ? me.length === oe.length && me.every((v, j) => numClose(v, oe[j]))
                    : String(me) === String(oe);
              if (!same) {
                diffs.push({
                  script,
                  block,
                  kind: 'value-mismatch',
                  detail: `variable '${key}' cell element ${i + 1} differs: MATLAB=${JSON.stringify(me)} OpenMat=${JSON.stringify(oe)}`,
                  matlab: mv,
                  openmat: ov
                });
                break;
              }
            }
          }
        }
      } else if (String(mv.value) === 'logical') {
        // A logical array: the class name agrees, so the *values* have to
        // agree too. The data is row-major on both sides (MATLAB's runner
        // writes `reshape(val.', 1, [])`).
        const mData = (mv as any).data;
        const oData = (ov as any).data;
        if (Array.isArray(mData) && Array.isArray(oData)) {
          if (mData.length !== oData.length) {
            diffs.push({
              script,
              block,
              kind: 'value-mismatch',
              detail: `variable '${key}' logical length differs: MATLAB=${mData.length} OpenMat=${oData.length}`,
              matlab: mv,
              openmat: ov
            });
          } else {
            for (let i = 0; i < mData.length; i++) {
              if (!numClose(Number(mData[i]), Number(oData[i]))) {
                diffs.push({
                  script,
                  block,
                  kind: 'value-mismatch',
                  detail: `variable '${key}' logical element ${i + 1} differs: MATLAB=${mData[i]} OpenMat=${oData[i]}`,
                  matlab: mv,
                  openmat: ov
                });
                break;
              }
            }
          }
        }
      }
    }
  }

  for (const key of Object.keys(ob)) {
    if (!(key in mb)) {
      diffs.push({
        script,
        block,
        kind: 'only-in-openmat',
        detail: `variable '${key}' exists in OpenMat but not in MATLAB`
      });
    }
  }
}

/**
 * MATLAB's `format short` display adds decoration that carries no numeric
 * payload. These are stripped before the token comparison so that the
 * comparator looks at the values, not at MATLAB's layout.
 */

/** `  Columns 1 through 7` / `  Column 14` block headers. */
const MATLAB_COLUMN_HEADER = /^\s*Columns?\s+\d+\s+through\s+\d+\s*$/;
/** `   1.0e+16 *` scale-factor lines. */
const MATLAB_SCALE_FACTOR = /^\s*(\d+(?:\.\d+)?[eE][-+]?\d+)\s*\*\s*$/;
/**
 * MATLAB's hyperlinked warning stack frames. MATLAB renders a warning's
 * stack as a run of `In <a href="matlab:...">fn</a> (line N)` lines; the
 * file paths and line numbers are display noise, not numeric payload.
 */
const MATLAB_STACK_FRAME = /In <a\s+href="matlab:/i;

/** Numeric token, including MATLAB's `Inf`/`NaN` spellings. */
const NUM_TOKEN = /-?(?:\d+\.?\d*(?:[eE][-+]?\d+)?|Inf|NaN)\b/g;

/** A value plus the scale factor MATLAB applied when printing it. */
interface ScaledToken {
  /** The mantissa exactly as printed. */
  mantissa: number;
  /** The `X.XXXe+NN` factor the mantissa is relative to (1 when absent). */
  scale: number;
}

/** Rewrite OpenMat's `Infinity` spelling to MATLAB's `Inf`. */
function canonicalizeSpelling(line: string): string {
  return line.replace(/-?Infinity\b/g, (m) => (m.startsWith('-') ? '-Inf' : 'Inf'));
}

/**
 * Extract MATLAB's numeric payload together with the scale factor in effect
 * for each token.
 *
 * MATLAB prints long arrays in column blocks, prefixing each block with a
 * `Columns N through M` header, and prints large/small magnitudes with an
 * `X.XXXe+NN *` scale factor whose mantissas follow. Both are display
 * artifacts: the header carries no data, and the scale factor applies to
 * every value printed after it.
 */
export function extractScaledTokens(lines: string[]): ScaledToken[] {
  const out: ScaledToken[] = [];
  let scale = 1;

  for (const raw of lines) {
    const line = canonicalizeSpelling(raw.replace(/\s+/g, ' ').trim());
    if (line.length === 0) continue;
    if (MATLAB_COLUMN_HEADER.test(line)) continue;
    if (MATLAB_STACK_FRAME.test(line)) continue;

    const sf = MATLAB_SCALE_FACTOR.exec(line);
    if (sf) {
      scale = parseFloat(sf[1]);
      continue;
    }

    for (const m of line.match(NUM_TOKEN) || []) {
      out.push({ mantissa: parseFloat(m), scale });
    }
  }

  return out;
}

/** Extract an OpenMat capture's numeric payload (no display artifacts). */
export function extractTokens(lines: string[]): number[] {
  return extractScaledTokens(lines).map((t) => t.mantissa * t.scale);
}

/** Compare captured command-window output line by line. */
function compareOutputs(
  mo: string[],
  oo: string[],
  diffs: Diff[],
  script: string,
  block: string
): void {
  // MATLAB prints a bare expression result; OpenMat prints "name =\n<value>".
  // Compare only the numeric payload lines, and allow MATLAB's extra text.
  const mTokens = extractScaledTokens(mo);
  const oTokens = extractTokens(oo);

  if (mTokens.length !== oTokens.length) {
    diffs.push({
      script,
      block,
      kind: 'output-mismatch',
      detail: `numeric token count differs: MATLAB=${mTokens.length} OpenMat=${oTokens.length}`,
      matlab: mo,
      openmat: oo
    });
    return;
  }

  for (let i = 0; i < mTokens.length; i++) {
    const { mantissa, scale } = mTokens[i];
    const openmatValue = oTokens[i];

    if (scale === 1) {
      // Both sides printed the value directly; compare with a relative
      // tolerance so that tiny values (e.g. 1.1e-16) do not trip the check.
      if (!numClose(mantissa, openmatValue, 1e-6)) {
        diffs.push({
          script,
          block,
          kind: 'output-mismatch',
          detail: `numeric token ${i + 1} differs: MATLAB=${mantissa} OpenMat=${openmatValue}`,
          matlab: mo,
          openmat: oo
        });
        return;
      }
      continue;
    }

    // MATLAB printed a scaled mantissa with only four decimals of
    // precision, so compare in mantissa space: rescale the OpenMat value
    // and require it to round to the same four-decimal mantissa. Comparing
    // the reconstructed values would be wrong, because MATLAB's display
    // genuinely loses the digits below the printed precision.
    const openmatMantissa = openmatValue / scale;
    const mUnits = Math.round(mantissa * 1e4);
    const oUnits = Math.round(openmatMantissa * 1e4);
    if (Math.abs(mUnits - oUnits) > 1) {
      diffs.push({
        script,
        block,
        kind: 'output-mismatch',
        detail:
          `numeric token ${i + 1} differs: MATLAB=${mantissa} (scale ${scale}) ` +
          `OpenMat=${openmatValue} (mantissa ${openmatMantissa})`,
        matlab: mo,
        openmat: oo
      });
      return;
    }
  }
}

function main(): void {
  const matlabPath = arg('--matlab');
  const openmatPath = arg('--openmat');
  const outPath = arg('--out');
  if (!matlabPath || !openmatPath) {
    console.error('usage: compare.ts --matlab ref.json --openmat om.json [--out diff.json]');
    process.exit(2);
  }

  const mRep: Report = JSON.parse(fs.readFileSync(matlabPath, 'utf8'));
  const oRep: Report = JSON.parse(fs.readFileSync(openmatPath, 'utf8'));

  // MATLAB's `jsonencode` renders a one-element struct array as an object
  // rather than an array, so both shapes have to be accepted.
  const scriptsOf = (rep: Report): Script[] =>
    Array.isArray(rep.scripts) ? rep.scripts : rep.scripts ? [rep.scripts] : [];

  const mScripts = scriptsOf(mRep);
  const oScripts = scriptsOf(oRep);

  const diffs: Diff[] = [];
  const summary: any[] = [];

  for (const ms of mScripts) {
    const os = oScripts.find((s) => s.script === ms.script);
    if (!os) {
      diffs.push({
        script: ms.script,
        block: '*',
        kind: 'only-in-matlab',
        detail: 'script missing from the OpenMat report'
      });
      continue;
    }

    for (const mb of ms.blocks) {
      const ob = os.blocks.find((b) => b.name === mb.name);
      if (!ob) {
        diffs.push({
          script: ms.script,
          block: mb.name,
          kind: 'only-in-matlab',
          detail: 'block missing from the OpenMat report'
        });
        continue;
      }

      const mErr = (mb.errors || []).filter(Boolean);
      const oErr = (ob.errors || []).filter(Boolean);

      if (mErr.length === 0 && oErr.length > 0) {
        diffs.push({
          script: ms.script,
          block: mb.name,
          kind: 'matlab-ok-openmat-error',
          detail: `OpenMat raised an error where MATLAB succeeded: ${oErr[0]}`,
          openmat: oErr
        });
        continue;
      }
      if (mErr.length > 0 && oErr.length === 0) {
        diffs.push({
          script: ms.script,
          block: mb.name,
          kind: 'openmat-ok-matlab-error',
          detail: `MATLAB raised an error where OpenMat succeeded: ${mErr[0]}`,
          matlab: mErr
        });
        continue;
      }
      if (mErr.length > 0 && oErr.length > 0) {
        // Both errored: that is parity for error-raising blocks.
        summary.push({
          script: ms.script,
          block: mb.name,
          status: 'both-error',
          matlab: mErr[0],
          openmat: oErr[0]
        });
        continue;
      }

      compareOutputs(mb.outputs || [], ob.outputs || [], diffs, ms.script, mb.name);
      compareWorkspace(
        mb.workspace || {},
        ob.workspace || {},
        diffs,
        ms.script,
        mb.name
      );
    }
  }

  const byKind: Record<string, number> = {};
  for (const d of diffs) byKind[d.kind] = (byKind[d.kind] || 0) + 1;

  const report = {
    totalBlocks: mScripts.reduce((n, s) => n + s.blocks.length, 0),
    diffCount: diffs.length,
    byKind,
    diffs,
    summary
  };

  console.log(`\n=== OpenMat vs MATLAB parity ===`);
  console.log(`blocks compared : ${report.totalBlocks}`);
  console.log(`differences     : ${report.diffCount}`);
  for (const [k, v] of Object.entries(byKind)) {
    console.log(`  ${k.padEnd(28)} ${v}`);
  }
  console.log('\n--- differences ---');
  for (const d of diffs) {
    console.log(`[${d.kind}] ${d.script} :: ${d.block}\n    ${d.detail}`);
  }

  if (outPath) {
    fs.writeFileSync(path.resolve(outPath), JSON.stringify(report, null, 2), 'utf8');
    console.log(`\nwrote ${outPath}`);
  }
}

main();
