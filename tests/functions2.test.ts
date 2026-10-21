import { describe, it, expect } from 'vitest';
import { Interpreter } from '../src/engine/interpreter';
import { Matrix } from '../src/engine/matrix';

/**
 * Regression tests for the handle-taking builtins and the numeric helpers
 * added alongside the function-handle support.
 *
 * Every expectation is a value MATLAB R2025b produces; the parity suite
 * (`tests/matlab-suite/functions2.m`) covers the same ground end to end.
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

describe('arrayfun', () => {
  it('applies the handle to every element', () => {
    const ws = run('a = arrayfun(@(x) x.^2, [1 2 3]);');
    expect(ws.a.toFlatArray()).toEqual([1, 4, 9]);
  });

  it('keeps the shape of the input', () => {
    const ws = run('a = arrayfun(@(x) x + 1, [1 2; 3 4]);');
    expect(ws.a.rows).toBe(2);
    expect(ws.a.cols).toBe(2);
    expect(ws.a.toFlatArray()).toEqual([2, 3, 4, 5]);
  });
});

describe('structfun', () => {
  it('applies the handle to every field and returns a column', () => {
    const ws = run("a = structfun(@(x) x * 2, struct('a', 1, 'b', 2));");
    expect(ws.a.rows).toBe(2);
    expect(ws.a.cols).toBe(1);
    expect(ws.a.toFlatArray()).toEqual([2, 4]);
  });
});

describe('conv, deconv and filter', () => {
  it('convolves two vectors', () => {
    const ws = run('a = conv([1 2], [1 2]); b = conv([1 2 3], [1 1]);');
    expect(ws.a.toFlatArray()).toEqual([1, 4, 4]);
    expect(ws.b.toFlatArray()).toEqual([1, 3, 5, 3]);
  });

  it('divides and reports the remainder of the dividend length', () => {
    const ws = run('[q, r] = deconv([1 2], [1 1]);');
    expect(ws.q.toFlatArray()).toEqual([1]);
    expect(ws.r.toFlatArray()).toEqual([0, 1]);
  });

  it('filters causally', () => {
    const ws = run('a = filter([1], [1], [1 2 3]); b = filter([1 2], [1 -1], [1 2 3]);');
    expect(ws.a.toFlatArray()).toEqual([1, 2, 3]);
    expect(ws.b.toFlatArray()).toEqual([1, 5, 12]);
  });
});

describe('radix conversion', () => {
  it('converts to and from binary', () => {
    expect(output('disp(dec2bin(5))')).toBe('101');
    expect(output('disp(dec2bin(5, 8))')).toBe('00000101');
    const ws = run("a = bin2dec('101');");
    expect((ws.a as Matrix).getScalar()).toBe(5);
  });

  it('converts to and from hexadecimal', () => {
    expect(output('disp(dec2hex(255))')).toBe('FF');
    expect(output('disp(dec2hex(255, 8))')).toBe('000000FF');
    const ws = run("a = hex2dec('FF');");
    expect((ws.a as Matrix).getScalar()).toBe(255);
  });
});

describe('fzero', () => {
  it('finds the root inside a bracket', () => {
    const ws = run('a = fzero(@(x) x.^2 - 1, [0 2]);');
    expect((ws.a as Matrix).getScalar()).toBeCloseTo(1, 12);
  });

  it('accepts a single starting point that is already a root', () => {
    const ws = run('a = fzero(@(x) x^2 - 1, 1);');
    expect((ws.a as Matrix).getScalar()).toBe(1);
  });

  it('reports a bracket without a sign change', () => {
    const res = new Interpreter().execute('a = fzero(@(x) x.^2 + 1, [0 2]);');
    expect(res.outputs.some((o) => o.isError)).toBe(true);
  });
});

describe('interp2', () => {
  it('interpolates bilinearly by default', () => {
    const ws = run('a = interp2([1 2], [3 4], [1 2; 3 4], 1.5, 3.5);');
    expect((ws.a as Matrix).getScalar()).toBeCloseTo(2.5, 12);
  });

  it('picks the nearest grid point, resolving a tie upward', () => {
    const ws = run("a = interp2([1 2], [3 4], [1 2; 3 4], 1.5, 3.5, 'nearest');");
    expect((ws.a as Matrix).getScalar()).toBe(4);
  });
});
