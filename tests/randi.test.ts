import { describe, it, expect } from 'vitest';
import { Interpreter } from '../src/engine/interpreter';

/**
 * Regression tests for `randi` and `randperm`.
 *
 * Every expectation is a value MATLAB R2025b produces from the default
 * seed (5489); the parity suite (`tests/matlab-suite/randi.m`) covers the
 * same ground end to end.
 *
 * The algorithm was established from MATLAB's own code:
 * `randstream::randiFcn` (`libmwmathrng.dylib` at `0x384b0`) draws one
 * uniform per element from the same stream as `rand` and maps it with
 * `imin + floor(u * (imax - imin + 1))`; `randstream::randpermFcn`
 * (`0x3a1b0`) draws `n` uniforms, sorts them and returns the indices in
 * ascending order of value.
 */

/** Run a script and return the text of its output. */
function output(code: string): string {
  const res = new Interpreter().execute(code);
  return res.outputs.map((o) => o.text).join('\n');
}

/** Run a script and return the flat data of a workspace variable. */
function data(code: string, name: string): number[] {
  const ws = new Interpreter().execute(code).workspace;
  return ws[name].toFlatArray();
}

describe('randi', () => {
  it('maps one uniform per element with floor(u * (imax - imin + 1))', () => {
    // MATLAB R2025b: rng(5489); randi(10, 1, 12)
    expect(data('rng(5489); a = randi(10, 1, 12);', 'a')).toEqual([
      9, 10, 2, 10, 7, 1, 3, 6, 10, 10, 2, 10,
    ]);
  });

  it('treats the scalar form as the range form with imin = 1', () => {
    // MATLAB R2025b: rng(5489); randi([1 10], 1, 12)
    expect(data('rng(5489); a = randi([1 10], 1, 12);', 'a')).toEqual([
      9, 10, 2, 10, 7, 1, 3, 6, 10, 10, 2, 10,
    ]);
  });

  it('honours an explicit [imin imax] range', () => {
    // MATLAB R2025b: rng(5489); randi([2 5], 1, 12)
    expect(data('rng(5489); a = randi([2 5], 1, 12);', 'a')).toEqual([
      5, 5, 2, 5, 4, 2, 3, 4, 5, 5, 2, 5,
    ]);
  });

  it('fills the result column-major', () => {
    // MATLAB R2025b: rng(5489); randi(10, 2, 3) -> 9 2 7 / 10 10 1
    expect(output('rng(5489); disp(randi(10, 2, 3))')).toBe(
      ['     9     2     7', '    10    10     1'].join('\n'),
    );
  });

  it('accepts a size vector', () => {
    expect(data('rng(5489); a = randi(10, [2 3]);', 'a')).toEqual(
      data('rng(5489); a = randi(10, 2, 3);', 'a'),
    );
  });

  it('rejects a bad range with MATLAB\'s own message', () => {
    const res = new Interpreter().execute('randi(0);');
    const errors = res.outputs.filter((o) => o.isError);
    expect(errors.length).toBe(1);
    expect(errors[0].text).toMatch(/positive scalar integer value IMAX/);
  });
});

describe('randperm', () => {
  it('returns the argsort of n uniforms', () => {
    // MATLAB R2025b: rng(5489); randperm(10)
    expect(data('rng(5489); a = randperm(10);', 'a')).toEqual([
      6, 3, 7, 8, 5, 1, 2, 4, 9, 10,
    ]);
  });

  it('is a row vector', () => {
    const ws = new Interpreter().execute('rng(5489); a = randperm(6);').workspace;
    expect(ws.a.rows).toBe(1);
    expect(ws.a.cols).toBe(6);
  });

  it('is a permutation of 1:n', () => {
    const p = data('rng(5489); a = randperm(20);', 'a');
    expect(p.slice().sort((x, y) => x - y)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
  });

  it('draws exactly n uniforms from the shared stream', () => {
    // MATLAB R2025b: rng(5489); randperm(10); rand(1,3)
    // -> the permutation, then the 11th..13th uniforms of the stream.
    expect(
      output('rng(5489); a = randperm(10); disp(a); disp(rand(1, 3));'),
    ).toBe(
      [
        '     6     3     7     8     5     1     2     4     9    10',
        '    0.1576    0.9706    0.9572',
      ].join('\n'),
    );
  });

  it('reproduces MATLAB\'s `randperm(n,k)` for every k', () => {
    // MATLAB R2025b, seed 5489. `randperm(n,k)` uses a *different* algorithm
    // from `randperm(n)` — MATLAB itself documents that — and it consumes a
    // different number of uniforms.
    const expected: Record<number, number[]> = {
      1: [9],
      2: [9, 10],
      3: [9, 5, 4],
      4: [7, 4, 8, 3],
      5: [6, 4, 7, 3, 10],
      6: [5, 3, 6, 2, 9, 10],
      7: [4, 3, 5, 10, 8, 9, 2],
      8: [4, 10, 5, 9, 7, 8, 2, 3],
      9: [3, 9, 4, 8, 6, 7, 1, 2, 10],
      10: [7, 2, 8, 6, 9, 1, 4, 3, 5, 10],
    };
    for (const [k, want] of Object.entries(expected)) {
      expect(data(`rng(5489); a = randperm(10, ${k});`, 'a')).toEqual(want);
    }
  });

  it('leaves the stream where MATLAB leaves it', () => {
    // MATLAB R2025b: rng(5489); randperm(10,4); rand(1,1) -> u9
    //               rng(5489); randperm(10,10); rand(1,1) -> u10
    expect(
      output('rng(5489); a = randperm(10, 4); disp(rand(1, 1));'),
    ).toContain('0.9575');
    expect(
      output('rng(5489); a = randperm(10, 10); disp(rand(1, 1));'),
    ).toContain('0.9649');
  });
});
