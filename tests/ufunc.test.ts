import { describe, it, expect } from 'vitest';
import { Interpreter } from '../src/engine/interpreter';
import { Matrix } from '../src/engine/matrix';

/**
 * Regression tests for the ufunc family, `bsxfun` and `str2func`.
 *
 * Every expectation is a value MATLAB R2025b produces; the parity suite
 * (`tests/matlab-suite/ufunc.m`) covers the same ground end to end.
 */

/** Run a script and return the workspace it produced. */
function run(code: string): Record<string, any> {
  return new Interpreter().execute(code).workspace;
}

/** Run a script and return the text of its output. */
function output(code: string): string {
  const res = new Interpreter().execute(code);
  return res.outputs.map((o) => o.text).join('\n');
}

describe('logical-valued operators', () => {
  it('makes comparison operators return logical arrays', () => {
    const ws = run('a = [1 2] == [1 3];');
    expect(ws.a.isLogical).toBe(true);
    expect(ws.a.toFlatArray()).toEqual([1, 0]);
  });

  it('makes `&` and `|` return logical arrays', () => {
    const ws = run('a = [1 0] & [1 1];');
    expect(ws.a.isLogical).toBe(true);
    expect(ws.a.toFlatArray()).toEqual([1, 0]);
  });

  it('makes `&&` and `||` return logical scalars', () => {
    const ws = run('a = 1 && 1; b = 0 || 0;');
    expect(ws.a.isLogical).toBe(true);
    expect(ws.b.isLogical).toBe(true);
    expect(ws.b.getScalar()).toBe(0);
  });
});

describe('the ufunc family', () => {
  it('adds with plus', () => {
    const ws = run('a = plus([1 2], [3 4]);');
    expect(ws.a.toFlatArray()).toEqual([4, 6]);
  });

  it('subtracts with minus', () => {
    const ws = run('a = minus([1 2], [3 4]);');
    expect(ws.a.toFlatArray()).toEqual([-2, -2]);
  });

  it('multiplies element-wise with times', () => {
    // MATLAB's `times` is `.*`; `mtimes` is the matrix product.
    const ws = run('a = times([1 2; 3 4], [1 0; 0 1]);');
    expect(ws.a.toFlatArray()).toEqual([1, 0, 0, 4]);
  });

  it('multiplies matrices with mtimes', () => {
    const ws = run('a = mtimes([1 2; 3 4], [1 0; 0 1]);');
    expect(ws.a.toFlatArray()).toEqual([1, 2, 3, 4]);
  });

  it('divides element-wise with rdivide', () => {
    const ws = run('a = rdivide([1 2], [4 2]);');
    expect(ws.a.toFlatArray()).toEqual([0.25, 1]);
  });

  it('divides element-wise with ldivide', () => {
    const ws = run('a = ldivide([4 2], [1 2]);');
    expect(ws.a.toFlatArray()).toEqual([0.25, 1]);
  });

  it('raises to a power with power', () => {
    const ws = run('a = power([2 3], 2);');
    expect(ws.a.toFlatArray()).toEqual([4, 9]);
  });

  it('negates with uminus and leaves uplus alone', () => {
    const ws = run('a = uminus([1 -2]); b = uplus(3);');
    expect(ws.a.toFlatArray()).toEqual([-1, 2]);
    expect(ws.b.getScalar()).toBe(3);
  });

  it('compares with eq, ne, lt, le, gt and ge', () => {
    const ws = run(
      'a = eq(1, 2); b = ne(1, 2); c = lt(1, 2); d = le(1, 2); e = gt(1, 2); f = ge(1, 2);'
    );
    expect(ws.a.getScalar()).toBe(0);
    expect(ws.b.getScalar()).toBe(1);
    expect(ws.c.getScalar()).toBe(1);
    expect(ws.d.getScalar()).toBe(1);
    expect(ws.e.getScalar()).toBe(0);
    expect(ws.f.getScalar()).toBe(0);
    expect(ws.a.isLogical).toBe(true);
  });

  it('combines with and, or, xor and not', () => {
    const ws = run(
      'a = and([1 0], [1 1]); b = or([1 0], [0 1]); c = xor([1 0], [0 1]); d = not([0 1]);'
    );
    expect(ws.a.toFlatArray()).toEqual([1, 0]);
    expect(ws.b.toFlatArray()).toEqual([1, 1]);
    expect(ws.c.toFlatArray()).toEqual([1, 1]);
    expect(ws.d.toFlatArray()).toEqual([1, 0]);
    expect(ws.d.isLogical).toBe(true);
  });
});

describe('bsxfun', () => {
  it('applies a named handle element-wise', () => {
    const ws = run('a = bsxfun(@plus, [1 2], [3 4]);');
    expect(ws.a.toFlatArray()).toEqual([4, 6]);
  });

  it('expands singleton dimensions', () => {
    const ws = run('a = bsxfun(@plus, [1; 2; 3], [1 2 3]);');
    expect(ws.a.rows).toBe(3);
    expect(ws.a.cols).toBe(3);
    expect(ws.a.toFlatArray()).toEqual([2, 3, 4, 3, 4, 5, 4, 5, 6]);
  });

  it('accepts an anonymous function', () => {
    const ws = run('a = bsxfun(@(x, y) x .* y, [1 2], [3 4]);');
    expect(ws.a.toFlatArray()).toEqual([3, 8]);
  });
});

describe('str2func', () => {
  it('makes a function handle', () => {
    expect(output('h = str2func("sin"); disp(class(h))')).toMatch(
      /function_handle/
    );
  });

  it('produces a callable handle', () => {
    const ws = run('h = str2func("sin"); a = h(0);');
    expect((ws.a as Matrix).getScalar()).toBe(0);
  });
});
