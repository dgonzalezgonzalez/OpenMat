import { describe, it, expect } from 'vitest';
import { Interpreter } from '../src/engine/interpreter';
import { Matrix } from '../src/engine/matrix';

/**
 * Regression tests for the logical type, the shape predicates and the
 * grid/rotation builtins.
 *
 * Every expectation is a value MATLAB R2025b produces. The parity suite
 * (`tests/matlab-suite/newbuiltins2.m`) covers the same ground end to end;
 * these unit tests exist so that a regression is caught by `npm test` too.
 */

/** Run a script and return the workspace it produced. */
function run(code: string): Record<string, any> {
  return new Interpreter().execute(code).workspace;
}

/** Run a script and return the text of its last output line. */
function output(code: string): string {
  const res = new Interpreter().execute(code);
  return res.outputs.map((o) => o.text).join('\n');
}

/**
 * The numeric value of a logical.
 *
 * A logical scalar is a JavaScript boolean in this engine; a logical array
 * is a `Matrix` with the `isLogical` flag set.
 */
function scalarOf(v: any): number {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof Matrix) return v.getScalar();
  throw new Error(`not a logical: ${String(v)}`);
}

describe('logical values', () => {
  it('true and false are logical constants', () => {
    const ws = run('a = true; b = false;');
    expect(ws.a).toBe(true);
    expect(ws.b).toBe(false);
  });

  it('disp prints a logical as 1 or 0, not as true/false', () => {
    // MATLAB's `disp(true)` prints "     1". Printing the JavaScript
    // boolean would make the parity harness's numeric token counts differ.
    expect(output('disp(true)')).toMatch(/^\s+1$/);
    expect(output('disp(false)')).toMatch(/^\s+0$/);
  });

  it('class reports logical for logicals and double for numbers', () => {
    expect(output('class(true)')).toMatch(/'logical'/);
    expect(output('class(logical([1 0]))')).toMatch(/'logical'/);
    expect(output('class(1)')).toMatch(/'double'/);
  });

  it('logical converts non-zero values to 1 and zero to 0', () => {
    const ws = run('a = logical([0 1 2 -3]);');
    expect((ws.a as Matrix).toFlatArray()).toEqual([0, 1, 1, 1]);
    expect((ws.a as Matrix).isLogical).toBe(true);
  });

  it('logical refuses NaN, exactly as MATLAB does', () => {
    const res = new Interpreter().execute('a = logical(NaN);');
    expect(res.outputs.some((o) => /NaN values cannot be converted to logicals/.test(o.text))).toBe(true);
  });

  it('arithmetic on a logical produces a double, as in MATLAB', () => {
    const ws = run('a = true + 1;');
    expect((ws.a as Matrix).isLogical).toBeFalsy();
    expect((ws.a as Matrix).getScalar()).toBe(2);
  });
});

describe('shape predicates', () => {
  it('isrow and iscolumn follow MATLAB', () => {
    const ws = run(
      'a = isrow([1 2]); b = isrow([1;2]); c = iscolumn([1;2]); d = iscolumn([1 2]);'
    );
    expect(scalarOf(ws.a)).toBe(1);
    expect(scalarOf(ws.b)).toBe(0);
    expect(scalarOf(ws.c)).toBe(1);
    expect(scalarOf(ws.d)).toBe(0);
  });

  it('isvector and ismatrix follow MATLAB', () => {
    const ws = run(
      'a = isvector([1 2]); b = isvector([1;2]); c = isvector([1 2;3 4]); d = ismatrix([1 2]);'
    );
    expect(scalarOf(ws.a)).toBe(1);
    expect(scalarOf(ws.b)).toBe(1);
    expect(scalarOf(ws.c)).toBe(0);
    expect(scalarOf(ws.d)).toBe(1);
  });
});

describe('flip and rot90', () => {
  it('flip reverses along the first non-singleton dimension', () => {
    const ws = run('a = flip([1 2; 3 4]); b = flip([1 2 3]);');
    expect((ws.a as Matrix).toFlatArray()).toEqual([3, 4, 1, 2]);
    expect((ws.b as Matrix).toFlatArray()).toEqual([3, 2, 1]);
  });

  it('rot90 rotates counter-clockwise', () => {
    const ws = run('a = rot90([1 2; 3 4]); b = rot90([1 2; 3 4], 2);');
    expect((ws.a as Matrix).toFlatArray()).toEqual([2, 4, 1, 3]);
    expect((ws.b as Matrix).toFlatArray()).toEqual([4, 3, 2, 1]);
  });
});

describe('meshgrid and ndgrid', () => {
  it('meshgrid returns length(y) x length(x) arrays', () => {
    const ws = run('[X, Y] = meshgrid(1:3, 1:2);');
    const X = ws.X as Matrix;
    const Y = ws.Y as Matrix;
    expect([X.rows, X.cols]).toEqual([2, 3]);
    expect(X.toFlatArray()).toEqual([1, 2, 3, 1, 2, 3]);
    expect(Y.toFlatArray()).toEqual([1, 1, 1, 2, 2, 2]);
  });

  it('ndgrid returns length(x) x length(y) arrays', () => {
    const ws = run('[X, Y] = ndgrid(1:3, 1:2);');
    const X = ws.X as Matrix;
    const Y = ws.Y as Matrix;
    expect([X.rows, X.cols]).toEqual([3, 2]);
    expect(X.toFlatArray()).toEqual([1, 1, 2, 2, 3, 3]);
    expect(Y.toFlatArray()).toEqual([1, 2, 1, 2, 1, 2]);
  });
});

describe('strfind', () => {
  it('returns non-overlapping matches, as MATLAB does', () => {
    // MATLAB's strfind('hello','ll') is 3, not [3 4]: the search resumes
    // after the end of the first match.
    const ws = run("a = strfind('hello','ll'); b = strfind('aXbXc','X');");
    expect((ws.a as Matrix).toFlatArray()).toEqual([3]);
    expect((ws.b as Matrix).toFlatArray()).toEqual([2, 4]);
  });
});

describe('engine errors', () => {
  it('execute() reports an error instead of throwing', () => {
    // Regression guard: the error handler used to read `process.env`, which
    // does not exist in the browser bundle. The resulting ReferenceError
    // escaped execute() and left the UI's Command Window blank for every
    // failing command. `execute()` must never throw.
    const res = new Interpreter().execute('thisFunctionDoesNotExist(1);');
    expect(res.outputs.some((o) => o.isError)).toBe(true);
    expect(res.outputs.some((o) => /Unrecognized function/.test(o.text))).toBe(true);
  });
});
