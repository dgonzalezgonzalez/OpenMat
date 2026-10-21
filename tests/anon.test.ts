import { describe, it, expect } from 'vitest';
import { Interpreter } from '../src/engine/interpreter';
import { Matrix } from '../src/engine/matrix';

/**
 * Regression tests for anonymous functions and function handles.
 *
 * Every expectation is a value MATLAB R2025b produces. The parity suite
 * (`tests/matlab-suite/anon.m`) covers the same ground end to end.
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

describe('anonymous functions', () => {
  it('evaluates a one-parameter body', () => {
    const ws = run('f = @(x) x + 1; a = f(2);');
    expect((ws.a as Matrix).getScalar()).toBe(3);
  });

  it('evaluates a body element-wise over a vector', () => {
    const ws = run('f = @(x) x + 1; a = f([1 2 3]);');
    expect((ws.a as Matrix).toFlatArray()).toEqual([2, 3, 4]);
  });

  it('evaluates a body with several parameters', () => {
    const ws = run('g = @(x, y) x .* y; a = g(3, 4);');
    expect((ws.a as Matrix).getScalar()).toBe(12);
  });

  it('supports a body with no parameters', () => {
    const ws = run('m = @() 42; a = m();');
    expect((ws.a as Matrix).getScalar()).toBe(42);
  });

  it('captures the workspace when the handle is created', () => {
    // MATLAB captures by value: the handle sees `base` as it was when the
    // handle was made.
    const ws = run('base = 10; n = @(x) x + base; a = n(1);');
    expect((ws.a as Matrix).getScalar()).toBe(11);
  });

  it('supports a named handle such as @sin', () => {
    const ws = run('h = @sin; a = h(0);');
    expect((ws.a as Matrix).getScalar()).toBe(0);
  });

  it('reports its class as function_handle', () => {
    expect(output('f = @(x) x + 1; disp(class(f))')).toMatch(/function_handle/);
  });

  it('displays itself the way MATLAB does', () => {
    // MATLAB prints `@(x)x+1` — no space between the parameter list and
    // the body.
    expect(output('f = @(x) x + 1; disp(f)')).toBe('@(x)x+1');
    expect(output('g = @(x, y) x .* y; disp(g)')).toBe('@(x,y)x.*y');
    expect(output('h = @sin; disp(h)')).toBe('@sin');
  });

  it('is callable through feval', () => {
    const ws = run('p = @(x) x * 2; a = feval(p, 7);');
    expect((ws.a as Matrix).getScalar()).toBe(14);
  });
});

describe('the @ operator', () => {
  it('is never silently ignored', () => {
    // Regression guard: the lexer used to drop `@` entirely, which turned
    // `@(x) x + 1` into the parenthesised variable `(x) + 1` — a silently
    // wrong answer rather than an error.
    const res = new Interpreter().execute('x = 5; f = @(x) x + 1;');
    expect(res.outputs.some((o) => o.isError)).toBe(false);
    expect(typeof res.workspace.f).toBe('object');
    expect((res.workspace.f as any).kind).toBe('function_handle');
  });
});
