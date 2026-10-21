import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Interpreter } from '../src/engine/interpreter';
import { extendedNorm2 } from '../src/engine/ext80';
import { hypot as fdlibmHypot } from '../src/engine/fdlibm';

/**
 * Regression tests for MATLAB's *extended precision* builtins.
 *
 * Two of them are not what the obvious implementation gives:
 *
 * - `hypot` is a FDLIBM `e_hypot.c` port, not `Math.hypot` and not
 *   `sqrt(x*x + y*y)`. MATLAB's version is bit-exact against the port.
 * - `norm(v, 2)` and `norm(A, 'fro')` accumulate in **x87 80-bit extended
 *   precision**, not in double precision. MATLAB's own answer differs by one
 *   ulp from the correctly rounded exact value on some inputs, and only the
 *   80-bit pipeline reproduces it.
 *
 * The expected values are MATLAB R2025b bit patterns (`num2hex`) recorded in
 * `tests/fixtures/extended_precision.json`.
 */

interface Fixture {
  hypot: Array<[number | string, number | string, string]>;
  norm: Array<[Array<number | string>, string]>;
  fro: Array<[Array<number | string>, string]>;
}

const fixture: Fixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'extended_precision.json'), 'utf8')
);

/**
 * The fixture encodes MATLAB's non-finite values as text, because JSON has no
 * way to spell `Inf` or `NaN`.
 */
function dec(v: number | string): number {
  if (typeof v === 'number') return v;
  if (v === 'Inf') return Infinity;
  if (v === '-Inf') return -Infinity;
  if (v === 'NaN') return NaN;
  return Number(v);
}

/** The IEEE-754 bit pattern of a double, in MATLAB's `num2hex` format. */
function hex(x: number): string {
  if (Number.isNaN(x)) return 'nan';
  if (x === Infinity) return 'inf';
  if (x === -Infinity) return '-inf';
  const buf = new ArrayBuffer(8);
  new DataView(buf).setFloat64(0, x);
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

describe('hypot', () => {
  it('matches MATLAB bit for bit', () => {
    for (const [x, y, want] of fixture.hypot) {
      expect(hex(fdlibmHypot(dec(x), dec(y)))).toBe(want);
    }
  });

  it('is exposed as a builtin and matches the engine path', () => {
    for (const [x, y, want] of fixture.hypot) {
      const res = new Interpreter().execute(`h = hypot(${x}, ${y});`);
      expect(hex(res.workspace['h'].getScalar())).toBe(want);
    }
  });

  it('handles the IEEE special cases the way MATLAB does', () => {
    const ws = new Interpreter().execute(`
      a = hypot(Inf, 1);
      b = hypot(-Inf, 1);
      c = hypot(NaN, 1);
      d = hypot(0, 0);
    `).workspace;
    expect(ws['a'].getScalar()).toBe(Infinity);
    expect(ws['b'].getScalar()).toBe(Infinity);
    expect(Number.isNaN(ws['c'].getScalar())).toBe(true);
    expect(ws['d'].getScalar()).toBe(0);
  });
});

describe('norm(v, 2)', () => {
  it('matches MATLAB bit for bit', () => {
    for (const [values, want] of fixture.norm) {
      expect(hex(extendedNorm2(values.map(dec)))).toBe(want);
    }
  });

  it('is exposed as a builtin and matches the engine path', () => {
    for (const [values, want] of fixture.norm) {
      const res = new Interpreter().execute(
        `v = [${values.join(', ')}];\nn = norm(v, 2);\nm = norm(v);`
      );
      expect(hex(res.workspace['n'].getScalar())).toBe(want);
      expect(hex(res.workspace['m'].getScalar())).toBe(want);
    }
  });

  it('differs from `sqrt(sum(v.^2))` — that is the point', () => {
    // If this ever stops holding, the 80-bit pipeline has been replaced by
    // something less faithful and the bit-exactness claim is void.
    let differing = 0;
    for (const [values] of fixture.norm) {
      const v = values.map(dec);
      const naive = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
      if (hex(naive) !== hex(extendedNorm2(v))) differing++;
    }
    expect(differing).toBeGreaterThan(0);
  });

  it('handles the IEEE special cases the way MATLAB does', () => {
    const ws = new Interpreter().execute(`
      a = norm([Inf 1]);
      b = norm([NaN 1]);
      c = norm([0 0]);
      d = norm([]);
    `).workspace;
    expect(ws['a'].getScalar()).toBe(Infinity);
    expect(Number.isNaN(ws['b'].getScalar())).toBe(true);
    expect(ws['c'].getScalar()).toBe(0);
    expect(ws['d'].getScalar()).toBe(0);
  });
});

describe('norm(A, "fro")', () => {
  it('matches MATLAB bit for bit', () => {
    for (const [values, want] of fixture.fro) {
      expect(hex(extendedNorm2(values.map(dec)))).toBe(want);
    }
  });

  it('is exposed as a builtin and matches the engine path', () => {
    for (const [values, want] of fixture.fro) {
      // The Frobenius norm does not depend on the shape, so a square matrix
      // of the right size reproduces the reference value.
      const side = Math.round(Math.sqrt(values.length));
      expect(side * side).toBe(values.length);
      const res = new Interpreter().execute(
        `A = reshape([${values.join(', ')}], ${side}, ${side});\n` +
        `n = norm(A, 'fro');`
      );
      expect(hex(res.workspace['n'].getScalar())).toBe(want);
    }
  });
});
