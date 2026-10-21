import { describe, it, expect } from 'vitest';
import { Interpreter } from '../src/engine/interpreter';
import { Matrix, matlabSumVector, matlabSumStrided } from '../src/engine/matrix';

/**
 * Regression tests for engine behaviours that were wrong at some point.
 *
 * Every expectation here is a value MATLAB R2025b produces; where a rule is
 * subtle (MATLAB's `end` in an index, the growth rules for indexed
 * assignment) the comment says so, because the obvious implementation is
 * usually the wrong one.
 */

/** Run a script and return the workspace it produced. */
function run(code: string): Record<string, any> {
  return new Interpreter().execute(code).workspace;
}

/**
 * The IEEE-754 bit pattern of a double, as MATLAB's `num2hex` prints it
 * (most-significant nibble first). Comparing bit patterns rather than
 * decimal literals is what makes "bit-exact" testable: two doubles that
 * print the same to 17 significant digits can still differ in the last bit,
 * and that last bit is exactly what the MATLAB parity harness cares about.
 */
function hex(x: number): string {
  const buf = new ArrayBuffer(8);
  new DataView(buf).setFloat64(0, x);
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

describe('indexing', () => {
  it('resolves `end` inside an index expression', () => {
    const ws = run(`
      A = [1 2 3; 4 5 6];
      lastRow = A(end, 1);
      lastCol = A(1, end);
      n = size(A, 1);
    `);
    expect(ws['lastRow'].getScalar()).toBe(4);
    expect(ws['lastCol'].getScalar()).toBe(3);
    expect(ws['n'].getScalar()).toBe(2);
  });

  it('resolves `end` after an arithmetic operator in the index', () => {
    // `A(end-1, :)` must subtract from the dimension, not from `end` itself.
    const ws = run(`
      A = [1 2 3; 4 5 6];
      r = A(end-1, :);
    `);
    expect(ws['r'].data).toEqual([[1, 2, 3]]);
  });

  it('grows a matrix when an indexed assignment reaches past the end', () => {
    const ws = run(`
      A = [1 2; 3 4];
      A(3, 3) = 9;
    `);
    const a = ws['A'] as Matrix;
    expect(a.rows).toBe(3);
    expect(a.cols).toBe(3);
    expect(a.get(3, 3)).toBe(9);
    // MATLAB fills the gap with zeros.
    expect(a.get(1, 3)).toBe(0);
    expect(a.get(3, 1)).toBe(0);
  });

  it('leaves a matrix untouched when an index is empty', () => {
    const ws = run(`
      A = [1 2; 3 4];
      A([]) = [];
    `);
    const a = ws['A'] as Matrix;
    expect(a.rows).toBe(2);
    expect(a.cols).toBe(2);
    expect(a.data).toEqual([[1, 2], [3, 4]]);
  });
});

describe('structs', () => {
  it('reads and writes fields with dot notation', () => {
    const ws = run(`
      s.x = 1;
      s.y = 2;
      s.z = s.x + s.y;
    `);
    // Struct fields hold the engine's numeric representation, a Matrix.
    expect((ws['s'].x as Matrix).getScalar()).toBe(1);
    expect((ws['s'].y as Matrix).getScalar()).toBe(2);
    expect((ws['s'].z as Matrix).getScalar()).toBe(3);
  });
});

describe('builtins', () => {
  it('returns row and column indices from find with two outputs', () => {
    const interp = new Interpreter();
    const res = interp.execute(`
      [r, c] = find([1 0 2; 0 3 0]);
    `);
    const ws = res.workspace;
    // MATLAB scans in column-major order: (1,1), (2,2), (1,3).
    expect((ws['r'] as Matrix).toFlatArray()).toEqual([1, 2, 1]);
    expect((ws['c'] as Matrix).toFlatArray()).toEqual([1, 2, 3]);
  });

  it('builds triu and tril', () => {
    const ws = run(`
      A = [1 2 3; 4 5 6; 7 8 9];
      u = triu(A);
      l = tril(A);
    `);
    expect((ws['u'] as Matrix).data).toEqual([
      [1, 2, 3],
      [0, 5, 6],
      [0, 0, 9]
    ]);
    expect((ws['l'] as Matrix).data).toEqual([
      [1, 0, 0],
      [4, 5, 0],
      [7, 8, 9]
    ]);
  });

  it('shifts the diagonal with the triu/tril offset', () => {
    // The offset sign differs between the two: `triu(A, 1)` drops the
    // diagonal, `tril(A, -1)` drops it, and the opposite sign keeps it.
    const ws = run(`
      A = [1 2 3; 4 5 6; 7 8 9];
      u1 = triu(A, 1);
      um1 = triu(A, -1);
      l1 = tril(A, 1);
      lm1 = tril(A, -1);
    `);
    expect((ws['u1'] as Matrix).data).toEqual([
      [0, 2, 3],
      [0, 0, 6],
      [0, 0, 0]
    ]);
    expect((ws['um1'] as Matrix).data).toEqual([
      [1, 2, 3],
      [4, 5, 6],
      [0, 8, 9]
    ]);
    expect((ws['l1'] as Matrix).data).toEqual([
      [1, 2, 0],
      [4, 5, 6],
      [7, 8, 9]
    ]);
    expect((ws['lm1'] as Matrix).data).toEqual([
      [0, 0, 0],
      [4, 0, 0],
      [7, 8, 0]
    ]);
  });

  it('concatenates with horzcat and vertcat', () => {
    const ws = run(`
      a = [1 2];
      b = [3 4];
      h = horzcat(a, b);
      v = vertcat(a, b);
    `);
    expect((ws['h'] as Matrix).data).toEqual([[1, 2, 3, 4]]);
    expect((ws['v'] as Matrix).data).toEqual([[1, 2], [3, 4]]);
  });

  it('binds a caught error to the catch variable', () => {
    const interp = new Interpreter();
    const res = interp.execute(`
      try
        error('boom');
      catch err
        msg = err.message;
      end
    `);
    expect(res.workspace['msg']).toContain('boom');
    expect(res.outputs.filter((o) => o.isError).length).toBe(0);
  });
});

describe('colon operator', () => {
  it('computes the step from the endpoints, not by accumulation', () => {
    // Accumulating 0.01 a hundred times drifts to 1.0000000000000007, which
    // would make `ceil` return 2 where MATLAB returns 1.
    const ws = run(`
      v = 0.01:0.01:1;
      k = ceil(0.01:0.01:1);
      count = length(v);
    `);
    expect(ws['count'].getScalar()).toBe(100);
    expect(ws['k'].getScalar()).toBe(1);
  });
});

describe('num2str', () => {
  it('matches MATLAB formatting', () => {
    const ws = run(`
      a = num2str(pi);
      b = num2str(1234.5678);
      c = num2str(0.000012345);
    `);
    expect(ws['a']).toBe('3.1416');
    expect(ws['b']).toBe('1234.5678');
    expect(ws['c']).toBe('1.2345e-05');
  });
});

describe('erf and erfc', () => {
  it('matches MATLAB bit for bit across the branches', () => {
    // Reference values from MATLAB R2025b, as raw IEEE-754 bit patterns.
    // The FDLIBM port has three branches (|x| < 0.84375, the expansion
    // about 1, and the asymptotic tail); each boundary is checked, because
    // a wrong constant or a wrong truncation in one branch still looks fine
    // in the others.
    const ref: Array<[string, number, string]> = [
      ['erfc(0.001)', 0.001, '3feff6c19e3fd964'],
      ['erfc(0.84375)', 0.84375, '3fcdcb8cae2d747e'],
      ['erfc(1.25)', 1.25, '3fb3bcd133aa0ffc'],
      ['erfc(2.0)', 2.0, '3f7328f5ec350e67'],
      ['erfc(3.0)', 3.0, '3ef729df65034229'],
      ['erfc(6.0)', 6.0, '3c78cf81557d20b7'],
      ['erfc(10.0)', 10.0, '36a7d8a7f2a8a2d0'],
      ['erf(0.001)', 0.001, '3f527cc3804d374c'],
      ['erf(1.25)', 1.25, '3fed8865d98abe00'],
      ['erf(3.0)', 3.0, '3fefffd1ac4135f9']
    ];
    for (const [label, x, want] of ref) {
      const fn = label.slice(0, label.indexOf('('));
      const res = new Interpreter().execute(`v = ${fn}(${x});`);
      expect(`${fn} at ${x}: ${hex(res.workspace['v'].getScalar())}`).toBe(
        `${fn} at ${x}: ${want}`
      );
    }
  });

  it('scales erf by 2/sqrt(pi) for tiny arguments', () => {
    // erf(x) ~ (2/sqrt(pi))*x for tiny x, not x. Getting this wrong is a
    // factor of 1.128 error in the whole small-argument region. FDLIBM's
    // correction term `efx = 2/sqrt(pi) - 1` is what produces this.
    const res = new Interpreter().execute(`
      a = erf(1e-20);
      b = erf(1e-300);
    `);
    expect(hex(res.workspace['a'].getScalar())).toBe('3bcaa4a230244ae0');
    expect(hex(res.workspace['b'].getScalar())).toBe('01a82e6d98711d3a');
  });

  it('keeps the asymptotic branch accurate in the far tail', () => {
    // The asymptotic branch splits the exponent as -z*z + (z-x)*(z+x) with
    // z = x truncated to single precision. FDLIBM clears the *low* 32 bits
    // (`SET_LOW_WORD(z, 0)`); truncating the wrong half silently destroys
    // the whole branch.
    const res = new Interpreter().execute(`
      a = erfc(5.0);
      b = erfc(20.0);
      c = erfc(25.0);
    `);
    expect(hex(res.workspace['a'].getScalar())).toBe('3d7b0c1a759f773a');
    expect(hex(res.workspace['b'].getScalar())).toBe('1b8b54f244df93de');
    expect(hex(res.workspace['c'].getScalar())).toBe('073cbcb3935e8706');
  });
});

describe('line continuation', () => {
  it('joins statements separated by ...', () => {
    const ws = run(`
      x = 1 + ...
          2 + ...
          3;
    `);
    expect(ws['x'].getScalar()).toBe(6);
  });
});

describe('sum', () => {
  /**
   * MATLAB's `sum` picks its kernel by the reduction's *memory stride*, not
   * by the `dim` argument. A contiguous reduction (down a column of a
   * matrix, or along a vector) has three regimes:
   *
   *   - length <= 43      -- plain left-to-right accumulation
   *   - 44 <= length < 89000 -- four-lane SIMD, combined as
   *                          `((a0 + a1) + a2) + a3`, tail folded forward
   *   - length >= 89000   -- runtime-partitioned, so the answer depends on
   *                          `maxNumCompThreads` and is not reproducible
   *
   * The threshold at 44 is the interesting one: a plain accumulation and the
   * SIMD kernel disagree in the last bits from 44 upward, so an
   * implementation that always accumulates sequentially is *wrong* for every
   * vector longer than 43.
   */
  it('matches MATLAB bit for bit across the contiguous length regimes', () => {
    // Reference values from MATLAB R2025b, each vector produced by
    // `rng(20240611); randn(1, n)`.
    const ref: Record<number, string> = {
      43: 'bfe092112d1f423f',
      44: 'bfbb221a3c4ce040',
      45: 'bfd55c2baca39000',
      47: '3fe8038c33d0a7e0',
      48: '3ff9ea61f0d5bb2c',
      49: '3ff44a8011513f1c',
      100: 'c01268a629a87237',
      2047: '404a2e0f3d7e0be2',
      2048: '4049deec80155f98'
    };
    for (const n of Object.keys(ref).map(Number)) {
      const res = new Interpreter().execute(
        `rng(20240611); v = randn(1, ${n}); s = sum(v);`
      );
      expect(hex(res.workspace['s'].getScalar())).toBe(ref[n]);
    }
  });

  /**
   * A *strided* reduction (along a row of an M x N matrix, where the row is
   * strided by M in MATLAB's column-major storage) uses a different kernel
   * with a different threshold: sequential below 2 048 elements, and blocked
   * into contiguous chunks of 1 024 at or above it. Both the chunk size and
   * the threshold are load-bearing -- changing either changes the last bits.
   */
  it('matches MATLAB bit for bit across the strided length regimes', () => {
    const ref: Record<string, string> = {
      '2x2047': '40611e5fde66339d',
      '2x2048': '40611b5f5aef78b8',
      '2x2049': '40614273485b4b61',
      '2x4096': '405c1f735bc6a207',
      '3x2047': '4046a698de259862',
      '3x2048': '404711524e8742e5',
      '3x2049': '40475341a93104dd',
      '3x4096': '40531e7e4ce118f4',
      '4x2047': '404d36e8188073c0',
      '4x2048': '404dc460168d557e',
      '4x2049': '404dbe84704ca92b',
      '4x4096': '401e84608ca60ec8'
    };
    for (const key of Object.keys(ref)) {
      const [m, n] = key.split('x').map(Number);
      const res = new Interpreter().execute(
        `rng(20240611); A = randn(${m}, ${n}); s = sum(A, 2);`
      );
      expect(hex(res.workspace['s'].get(1, 1))).toBe(ref[key]);
    }
  });

  it('agrees between a row vector, a column vector and a transpose', () => {
    // In MATLAB's column-major storage a row vector *is* the contiguous
    // array, so all three spellings must produce the identical double.
    const res = new Interpreter().execute(
      `rng(20240611); v = randn(1, 500); a = sum(v); b = sum(v(:)); c = sum(v(:).');`
    );
    expect(hex(res.workspace['a'].getScalar())).toBe('40154d73b52319eb');
    expect(res.workspace['b'].getScalar()).toBe(res.workspace['a'].getScalar());
    expect(res.workspace['c'].getScalar()).toBe(res.workspace['a'].getScalar());
  });

  it('dispatches to the documented kernel at each threshold', () => {
    // Re-implement each kernel here so the test states the rule rather than
    // just re-checking the numbers above. If someone moves a threshold in
    // src/engine/matrix.ts, this fails.
    const seq = (v: number[]) => v.reduce((a, b) => a + b, 0);

    const simdLanes = (v: number[]) => {
      const q = v.length - (v.length % 4);
      let a0 = 0, a1 = 0, a2 = 0, a3 = 0;
      for (let k = 0; k < q; k += 4) {
        a0 += v[k]; a1 += v[k + 1]; a2 += v[k + 2]; a3 += v[k + 3];
      }
      for (let k = q; k < v.length; k++) {
        if ((k - q) % 4 === 0) a0 += v[k];
        else if ((k - q) % 4 === 1) a1 += v[k];
        else if ((k - q) % 4 === 2) a2 += v[k];
        else a3 += v[k];
      }
      return ((a0 + a1) + a2) + a3;
    };

    const pairwise = (v: number[]): number => {
      if (v.length <= 44) return seq(v);
      const mid = v.length >> 1;
      return pairwise(v.slice(0, mid)) + pairwise(v.slice(mid));
    };

    const blocked = (v: number[]) => {
      let s = 0;
      for (let off = 0; off < v.length; off += 1024) {
        s += seq(v.slice(off, Math.min(off + 1024, v.length)));
      }
      return s;
    };

    // Values with a wide dynamic range, so the kernels genuinely disagree
    // in the last bits instead of coincidentally agreeing.
    const mk = (n: number) =>
      Array.from({ length: n }, (_, i) => (i % 4 === 0 ? 1e16 : 1 / (i + 1)));

    // Contiguous: sequential below 44, four-lane SIMD from 44 to 88 999,
    // and a midpoint-split pairwise tree at 89 000 and above.
    const v43 = mk(43);
    const v44 = mk(44);
    const v100 = mk(100);
    const v89000 = mk(89000);
    expect(matlabSumVector(v43)).toBe(seq(v43));
    expect(matlabSumVector(v44)).toBe(simdLanes(v44));
    expect(matlabSumVector(v100)).toBe(simdLanes(v100));
    expect(matlabSumVector(v89000)).toBe(pairwise(v89000));

    // Strided: sequential below 2 048, blocked into 1 024-element chunks
    // from 2 048 upward.
    const s2047 = mk(2047);
    const s2048 = mk(2048);
    const s4096 = mk(4096);
    expect(matlabSumStrided(s2047)).toBe(seq(s2047));
    expect(matlabSumStrided(s2048)).toBe(blocked(s2048));
    expect(matlabSumStrided(s4096)).toBe(blocked(s4096));
  });
});

describe('logncdf', () => {
  it('folds the scale factor before dividing', () => {
    // MATLAB evaluates `-(log(x) - mu) / (sigma * sqrt(2))`. Folding
    // `sigma * sqrt(2)` into the denominator *before* the division rounds
    // differently from dividing by `sigma` and then by `sqrt(2)`, and the
    // result differs in the last bit. Reference values from the MATLAB
    // shim in tests/harness/logncdf.m.
    const ref: Array<[number, number, number, string]> = [
      [0.5, 0, 1, '3fcf3ef351c928ec'],
      [1.5, 0, 1, '3fe509af3068ddba'],
      [2.0, 0.5, 0.25, '3fe8f6b81d502ec0'],
      [0.1, -1, 2, '3fd079b6c4e0e6cc'],
      [3.7, 0.3, 1.1, '3fea403c34ba8e26'],
      [12.5, 2, 0.5, '3feb4fac411ca040']
    ];
    for (const [x, mu, sigma, want] of ref) {
      const res = new Interpreter().execute(`v = logncdf(${x}, ${mu}, ${sigma});`);
      expect(hex(res.workspace['v'].getScalar())).toBe(want);
    }
  });

  it('returns 0 for non-positive arguments', () => {
    const res = new Interpreter().execute(`
      a = logncdf(0, 0, 1);
      b = logncdf(-1, 0, 1);
    `);
    expect(res.workspace['a'].getScalar()).toBe(0);
    expect(res.workspace['b'].getScalar()).toBe(0);
  });
});
